import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import type { OptimizationResponse } from '../ors/ors.types';
import type {
    AssignmentRow,
    BuildResult,
    PackageRow,
    StepInsertRow,
} from './database.types';

/** Service time per delivery stop, in seconds (15 minutes). Hardcoded for now. */
const TIME_PER_STOP = 900;

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
    private readonly logger = new Logger(DatabaseService.name);
    private pendingStatusId!: number;

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
    ) { }

    async onApplicationBootstrap(): Promise<void> {
        const rows: { id: number }[] = await this.dataSource.query(
            `SELECT id FROM package_status WHERE enums = $1`,
            ['PENDING'],
        );
        if (!rows.length) {
            throw new Error('package_status row with enums = \'PENDING\' not found.');
        }
        this.pendingStatusId = rows[0].id;
        this.logger.log(`Resolved PENDING status id: ${this.pendingStatusId}`);
    }

    /**
     * Creates a QueryRunner, starts a transaction, and returns it.
     * The caller is responsible for committing or rolling back.
     */
    async beginTransaction(): Promise<QueryRunner> {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        return runner;
    }

    /**
     * Fetches pending unassigned packages and active driver–vehicle assignments,
     * returning a ready-to-send ORS OptimizationRequest plus the lookup maps
     * needed by insertOptimisedRoutes.
     *
     * The SELECT on packages uses FOR UPDATE OF p SKIP LOCKED so that concurrent
     * scheduler workers never process the same packages simultaneously — this
     * addresses the race-condition TODO in the original Deno implementation.
     *
     * @param runner  Must already have an open transaction (beginTransaction).
     */
    async buildOptimizationRequest(runner: QueryRunner): Promise<BuildResult> {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        // 1. Fetch unassigned pending packages — locked for this transaction so
        //    a second concurrent worker will SKIP these rows entirely.
        // Current status is derived from the most recent package_timeline row
        // via a LATERAL subquery (packages has no status column directly).
        const packages: PackageRow[] = await runner.query(
            `
      SELECT
        p.id,
        p.tracking_number,
        p.created_at,
        p.warehouse_id,
        ST_X(w.warehouse_location::geometry)   AS warehouse_lon,
        ST_Y(w.warehouse_location::geometry)   AS warehouse_lat,
        pd.weight_kg,
        pdw.scheduled_arrival,
        ST_X(c.customer_location::geometry)    AS customer_lon,
        ST_Y(c.customer_location::geometry)    AS customer_lat
      FROM   packages                p
      JOIN   LATERAL (
               SELECT package_status
               FROM   package_timeline
               WHERE  package_id = p.id
               ORDER  BY created_at DESC
               LIMIT  1
             ) latest_status ON true
      LEFT   JOIN warehouse          w   ON w.id  = p.warehouse_id
      LEFT   JOIN package_assignment pa  ON pa.package_id = p.id
      LEFT   JOIN package_dimensions pd  ON pd.package_id = p.id
      LEFT   JOIN package_delivery_window pdw ON pdw.package_id = p.id
      JOIN   customer                c   ON c.id  = p.to_customer
      WHERE  latest_status.package_status = $1
        AND  p.optimisation_id   IS NULL
        AND  pa.package_id       IS NULL
      FOR UPDATE OF p SKIP LOCKED
      `,
            [this.pendingStatusId],
        );

        this.logger.debug(`Found ${packages.length} unassigned pending packages.`);

        // 2. Fetch active driver–vehicle assignments with vehicle/warehouse details.
        const assignments: AssignmentRow[] = await runner.query(
            `
      SELECT
        dva.driver_id,
        dva.vehicle_id,
        v.vehicle_gross_limits,
        vt.ors_vehicle_type,
        ST_X(w.warehouse_location::geometry) AS warehouse_lon,
        ST_Y(w.warehouse_location::geometry) AS warehouse_lat
      FROM  driver_vehicle_assignment dva
      JOIN  vehicles                  v   ON v.id  = dva.vehicle_id
      JOIN  vehicle_type              vt  ON vt.id = v.vehicle_type
      LEFT  JOIN warehouse            w   ON w.id  = v.warehouse_id
      `,
        );

        this.logger.debug(`Found ${assignments.length} driver–vehicle assignments.`);

        // 3. Resolve warehouse coordinates: prefer packages, fall back to vehicles.
        let warehouseCoords: [number, number] | null = null;

        for (const pkg of packages) {
            if (pkg.warehouse_lon != null && pkg.warehouse_lat != null) {
                warehouseCoords = [pkg.warehouse_lon, pkg.warehouse_lat];
                break;
            }
        }

        if (!warehouseCoords) {
            for (const a of assignments) {
                if (a.warehouse_lon != null && a.warehouse_lat != null) {
                    warehouseCoords = [a.warehouse_lon, a.warehouse_lat];
                    break;
                }
            }
        }

        if (!warehouseCoords) {
            throw new Error(
                'Could not determine warehouse location for routing. ' +
                'Ensure packages/vehicles are assigned to a warehouse with a location.',
            );
        }

        // 4. Build vehicles array.
        const vehicles: BuildResult['request']['vehicles'] = [];
        const vehicleMap: Record<number, string> = {};
        const driverMap: Record<number, string> = {};

        assignments.forEach((a, index) => {
            const vehicleNumericId = index + 1;
            const capacity =
                typeof a.vehicle_gross_limits === 'number' ? a.vehicle_gross_limits : 1000;
            vehicles.push({
                id: vehicleNumericId,
                profile: a.ors_vehicle_type,
                start: warehouseCoords!,
                end: warehouseCoords!,
                capacity: [capacity],
            });
            vehicleMap[vehicleNumericId] = a.vehicle_id;
            if (a.driver_id) {
                driverMap[vehicleNumericId] = a.driver_id;
            }
        });

        // 5. Build jobs array — apply priority rules and skip future-due packages.
        const jobs: BuildResult['request']['jobs'] = [];
        const jobMap: Record<number, string> = {};

        packages.forEach((pkg, index) => {
            if (pkg.customer_lon == null || pkg.customer_lat == null) return;

            // ORS expects weight in grams for capacity matching.
            const weight =
                typeof pkg.weight_kg === 'number' ? pkg.weight_kg * 1000 : 1;

            let priority = 0; // null scheduled_arrival → lowest priority
            let skipProcessing = false;

            if (pkg.scheduled_arrival) {
                const arrivalDate = new Date(pkg.scheduled_arrival);
                if (arrivalDate < startOfDay) {
                    priority = 100; // past-due: highest priority
                } else if (arrivalDate <= endOfDay) {
                    priority = 50; // due today: high priority
                } else {
                    skipProcessing = true; // future: skip tonight
                }
            }

            if (skipProcessing) return;

            const jobNumericId = index + 1;
            jobs.push({
                id: jobNumericId,
                service: TIME_PER_STOP,
                location: [pkg.customer_lon, pkg.customer_lat],
                amount: [weight],
                priority,
            });
            jobMap[jobNumericId] = pkg.id;
        });

        return {
            request: { jobs, vehicles },
            vehicleMap,
            jobMap,
            driverMap,
        };
    }

    /**
     * Persists the ORS optimisation result atomically inside `runner`.
     *
     * Insert sequence (mirrors the original database.ts, now fully transactional):
     *   1. vrp_optimization   — raw request / response snapshot
     *   2. vrp_solution       — summary statistics
     *   3. Per route:
     *      a. vrp_route
     *      b. package_assignment  (upsert — FK parent for vrp_route_step)
     *      c. vrp_route_step      (batch insert)
     *   4. packages.optimisation_id  — marks packages as processed, prevents
     *                                  re-inclusion in future nightly runs
     *
     * Because every write shares the same QueryRunner transaction, a failure at
     * any step rolls back the entire operation — resolving the atomicity TODO
     * from the original Deno implementation where Supabase SDK lacked transaction
     * support.
     *
     * @param runner  Must already have an open transaction (beginTransaction).
     */
    async insertOptimisedRoutes(
        runner: QueryRunner,
        requestPayload: BuildResult['request'],
        optimisationResponse: OptimizationResponse,
        vehicleMap: Record<number, string>,
        jobMap: Record<number, string>,
        driverMap: Record<number, string>,
    ): Promise<void> {
        const optimisedPackageIds = new Set<string>();

        // 1. vrp_optimization — store raw request/response for auditability.
        const optRows: { id: string }[] = await runner.query(
            `INSERT INTO vrp_optimization (provider, request, response)
       VALUES ($1, $2::jsonb, $3::jsonb)
       RETURNING id`,
            [
                'openrouteservice',
                JSON.stringify(requestPayload),
                JSON.stringify(optimisationResponse),
            ],
        );
        const optimizationId: string = optRows[0].id;

        // 2. vrp_solution — summary stats from the ORS response.
        const summary = optimisationResponse.summary ?? {};
        // computing_times is returned by VROOM but absent from the typed interface.
        const computingTimes =
            (summary as Record<string, unknown>)?.computing_times as
            | { loading?: number; solving?: number; routing?: number }
            | undefined;

        const solRows: { id: string }[] = await runner.query(
            `INSERT INTO vrp_solution (
         optimization_id,
         cost, routes_count, unassigned_count,
         delivery, amount, pickup,
         setup, service, duration, waiting_time, priority,
         loading_time, solving_time, routing_time
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
            [
                optimizationId,
                summary.cost ?? null,
                summary.routes ?? null,
                summary.unassigned ?? null,
                summary.delivery ?? null,
                (summary as Record<string, unknown>).amount ?? null,
                summary.pickup ?? null,
                summary.setup ?? null,
                summary.service ?? null,
                summary.duration ?? null,
                summary.waiting_time ?? null,
                summary.priority ?? null,
                computingTimes?.loading ?? 0,
                computingTimes?.solving ?? 0,
                computingTimes?.routing ?? 0,
            ],
        );
        const solutionId: string = solRows[0].id;

        // 3. Routes.
        for (const route of optimisationResponse.routes ?? []) {
            // 3a. vrp_route.
            const routeExt = route as typeof route & {
                amount?: number[];
                setup?: number;
                priority?: number;
            };

            const routeRows: { id: string }[] = await runner.query(
                `INSERT INTO vrp_route (
           solution_id,
           cost, delivery, amount, pickup,
           setup, service, duration, waiting_time, priority
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
                [
                    solutionId,
                    route.cost ?? null,
                    route.delivery ?? null,
                    routeExt.amount ?? null,
                    route.pickup ?? null,
                    routeExt.setup ?? null,
                    route.service ?? null,
                    route.duration ?? null,
                    route.waiting_time ?? null,
                    routeExt.priority ?? null,
                ],
            );
            const routeId: string = routeRows[0].id;

            // Collect steps and package assignments for this route.
            const stepsPayload: StepInsertRow[] = [];
            const routeAssignments: {
                package_id: string;
                vehicle_id: string;
                driver_id: string;
            }[] = [];

            for (const [index, step] of route.steps.entries()) {
                if (!step.location) continue;

                if (step.type === 'job' && (!step.id || !jobMap[step.id])) {
                    throw new Error(
                        `Missing package mapping for job id ${step.id ?? '(unknown)'}`,
                    );
                }

                const [lon, lat] = step.location;
                let pkgId: string | null = null;

                if (step.type === 'job' && step.id) {
                    pkgId = jobMap[step.id];
                    optimisedPackageIds.add(pkgId);
                    routeAssignments.push({
                        package_id: pkgId,
                        vehicle_id: vehicleMap[route.vehicle],
                        driver_id: driverMap[route.vehicle],
                    });
                }

                stepsPayload.push({
                    route_id: routeId,
                    step_index: index,
                    type: step.type,
                    solution_id: solutionId,
                    package_id: pkgId,
                    lon,
                    lat,
                    arrival: step.arrival ?? null,
                    duration: step.duration ?? null,
                    setup: step.setup ?? null,
                    service: step.service ?? null,
                    waiting_time: step.waiting_time ?? null,
                    // step.load is typed as number in ors.types but VROOM returns an
                    // array; store it directly — the column is int4[].
                    load:
                        step.load != null
                            ? Array.isArray(step.load)
                                ? (step.load as number[])
                                : [step.load as unknown as number]
                            : null,
                });
            }

            // 3b. package_assignment must be inserted before vrp_route_step (FK).
            if (routeAssignments.length > 0) {
                await this.upsertPackageAssignments(runner, routeAssignments);
            }

            // 3c. vrp_route_step — single batch INSERT.
            if (stepsPayload.length > 0) {
                await this.batchInsertRouteSteps(runner, stepsPayload);
            }
        }

        // 4. Mark all processed packages so they are excluded from future runs.
        if (optimisedPackageIds.size > 0) {
            await runner.query(
                `UPDATE packages
         SET    optimisation_id = $1
         WHERE  id = ANY($2::uuid[])`,
                [optimizationId, Array.from(optimisedPackageIds)],
            );
        }
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Upserts package_assignment rows.
     * Uses ON CONFLICT so re-running the optimiser for the same packages is safe.
     */
    private async upsertPackageAssignments(
        runner: QueryRunner,
        assignments: { package_id: string; vehicle_id: string; driver_id: string }[],
    ): Promise<void> {
        const placeholders = assignments
            .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
            .join(', ');

        const params = assignments.flatMap((a) => [
            a.package_id,
            a.vehicle_id,
            a.driver_id,
        ]);

        await runner.query(
            `INSERT INTO package_assignment (package_id, vehicle_id, driver_id)
       VALUES ${placeholders}
       ON CONFLICT (package_id)
       DO UPDATE SET
         vehicle_id = EXCLUDED.vehicle_id,
         driver_id  = EXCLUDED.driver_id`,
            params,
        );
    }

    /**
     * Batch-inserts vrp_route_step rows in a single statement.
     * Each row uses ST_SetSRID(ST_Point($lon, $lat), 4326) for the geometry
     * column, passing coordinates as separate typed parameters.
     *
     * Column order (13 params per row):
     *   route_id, step_index, type, solution_id, package_id,
     *   lon, lat (→ geometry), arrival, duration, setup, service,
     *   waiting_time, load
     */
    private async batchInsertRouteSteps(
        runner: QueryRunner,
        steps: StepInsertRow[],
    ): Promise<void> {
        const PARAMS_PER_ROW = 13;

        const placeholders = steps
            .map((_, i) => {
                const b = i * PARAMS_PER_ROW;
                return (
                    `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},` +
                    `ST_SetSRID(ST_Point($${b + 6},$${b + 7}),4326),` +
                    `$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`
                );
            })
            .join(', ');

        const params = steps.flatMap((s) => [
            s.route_id,      // 1
            s.step_index,    // 2
            s.type,          // 3
            s.solution_id,   // 4
            s.package_id,    // 5
            s.lon,           // 6  → ST_Point arg
            s.lat,           // 7  → ST_Point arg
            s.arrival,       // 8
            s.duration,      // 9
            s.setup,         // 10
            s.service,       // 11
            s.waiting_time,  // 12
            s.load,          // 13
        ]);

        await runner.query(
            `INSERT INTO vrp_route_step (
         route_id, step_index, type, solution_id, package_id,
         location,
         arrival, duration, setup, service, waiting_time, load
       ) VALUES ${placeholders}`,
            params,
        );
    }
}
