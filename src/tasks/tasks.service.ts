import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import { OrsService } from '../ors/ors.service';
import type { OptimizationResponse } from '../ors/ors.types';

/** Target local hour at which nightly optimization runs. */
const OPTIMIZATION_HOUR = 2;

/** How often (ms) the in-memory warehouse→timezone cache is refreshed. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface WarehouseTimezoneRow {
    id: string;
    tzid: string | null;
}

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name);

    /** In-memory cache: warehouse uuid → IANA tzid. Avoids spatial JOIN every tick. */
    private warehouseTzCache: Map<string, string> = new Map();
    private cacheBuiltAt: number = 0;

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly databaseService: DatabaseService,
        private readonly orsService: OrsService,
    ) { }

    /**
     * Catch-up guard: on server restart, if the nightly job was missed (e.g.
     * the process was down at 2am) and it's now past 2am warehouse-local time,
     * run it immediately — unless the scheduler_runs record already exists.
     */
    async onApplicationBootstrap(): Promise<void> {
        await this.refreshWarehouseCache();
        await this.checkAndRunOptimizations('boot');
    }

    /**
     * Polls every 5 minutes. The warehouse→timezone mapping is served from an
     * in-memory cache (refreshed hourly) so no DB query is issued on most ticks.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleCron(): Promise<void> {
        if (Date.now() - this.cacheBuiltAt > CACHE_TTL_MS) {
            await this.refreshWarehouseCache();
        }
        await this.checkAndRunOptimizations('cron');
    }

    /**
     * Fetches the warehouse→tzid mapping once via the PostGIS spatial join and
     * stores it in memory. Called on boot and when the TTL expires.
     */
    private async refreshWarehouseCache(): Promise<void> {
        const rows: WarehouseTimezoneRow[] = await this.dataSource.query(`
            SELECT w.id, tz.tzid
            FROM   warehouse w
            LEFT   JOIN tzdata.timezone tz
                   ON ST_Within(w.warehouse_location::geometry, tz.geom)
        `);
        this.warehouseTzCache = new Map(
            rows.map(r => [r.id, r.tzid ?? 'UTC']),
        );
        this.cacheBuiltAt = Date.now();
        this.logger.debug(`Warehouse timezone cache refreshed (${rows.length} warehouses).`);
    }

    /**
     * Core logic: iterates the in-memory cache, checks local time per warehouse,
     * and claims a scheduler_runs slot atomically before running optimization.
     *
     * For the cron trigger: only act if the local hour is exactly 2.
     * For the boot trigger: act if the local hour is >= 2 (catch-up).
     *
     * The INSERT ... ON CONFLICT DO NOTHING into scheduler_runs is the atomic
     * guard — only the first caller (whether cron or restart) will get a
     * RETURNING row. All subsequent calls are no-ops for that warehouse+date.
     */
    private async checkAndRunOptimizations(trigger: 'cron' | 'boot'): Promise<void> {
        const warehouses = [...this.warehouseTzCache.entries()].map(([id, tzid]) => ({ id, tzid }));

        for (const warehouse of warehouses) {
            const tzid = warehouse.tzid ?? 'UTC';
            const now = new Date();

            const localHour = this.getLocalHour(now, tzid);
            const localDate = this.getLocalDate(now, tzid); // YYYY-MM-DD

            const isInWindow =
                trigger === 'boot'
                    ? localHour >= OPTIMIZATION_HOUR   // missed while down
                    : localHour === OPTIMIZATION_HOUR; // normal cron tick

            if (!isInWindow) continue;

            // Atomic claim — unique constraint on (warehouse_id, run_date) means
            // only one winner per warehouse per local calendar day.
            const claimed: { id: string }[] = await this.dataSource.query(
                `INSERT INTO scheduler_runs (warehouse_id, run_date)
                 VALUES ($1, $2::date)
                 ON CONFLICT (warehouse_id, run_date) DO NOTHING
                 RETURNING id`,
                [warehouse.id, localDate],
            );

            if (claimed.length === 0) {
                this.logger.debug(
                    `[${trigger}] Warehouse ${warehouse.id}: already ran for ${localDate}, skipping.`,
                );
                continue;
            }

            this.logger.log(
                `[${trigger}] Warehouse ${warehouse.id}: starting optimization for ${localDate} (tz: ${tzid})`,
            );

            await this.runOptimization(warehouse.id).catch((err: unknown) => {
                this.logger.error(
                    `Optimization failed for warehouse ${warehouse.id}: ${String(err)}`,
                );
            });
        }
    }

    private async runOptimization(warehouseId: string): Promise<void> {
        const runner = await this.databaseService.beginTransaction();
        try {
            const { request, vehicleMap, jobMap, driverMap } =
                await this.databaseService.buildOptimizationRequest(runner);

            if (request.jobs.length === 0) {
                this.logger.log(`Warehouse ${warehouseId}: no eligible packages, skipping ORS call.`);
                await runner.rollbackTransaction();
                return;
            }

            const response = (await this.orsService.proxyPost(
                '/optimization',
                request,
                process.env.ORS_API_KEY ? `Bearer ${process.env.ORS_API_KEY}` : undefined,
            )) as OptimizationResponse;

            await this.databaseService.insertOptimisedRoutes(
                runner, request, response, vehicleMap, jobMap, driverMap,
            );
            await runner.commitTransaction();
            this.logger.log(`Warehouse ${warehouseId}: optimization committed successfully.`);
        } catch (err) {
            await runner.rollbackTransaction();
            throw err;
        } finally {
            await runner.release();
        }
    }

    /**
     * Returns the local hour (0–23) in the given IANA timezone.
     * Uses hourCycle h23 to avoid the '24' edge-case at midnight.
     */
    private getLocalHour(date: Date, tzid: string): number {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tzid,
            hour: 'numeric',
            hourCycle: 'h23',
        }).formatToParts(date);
        return Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    }

    /**
     * Returns the local calendar date as a YYYY-MM-DD string suitable for
     * Postgres ::date casts.
     */
    private getLocalDate(date: Date, tzid: string): string {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tzid }).format(date);
    }
}
