import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { DatabaseService } from 'src/database/database.service';
import { OrsService } from 'src/ors/ors.service';
import { QueueService } from './queue.service';

type MockRunner = {
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
};

function makeRunner(queryImpl?: jest.Mock): MockRunner {
    return {
        query: queryImpl ?? jest.fn().mockResolvedValue([]),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
    };
}

const WAREHOUSE_ROWS = [{ id: 'wh-1', tzid: 'UTC' }];

describe('TasksService', () => {
    let service: TasksService;
    let dsQuery: jest.Mock;
    let dbService: {
        beginTransaction: jest.Mock;
        buildOptimizationRequest: jest.Mock;
        insertOptimisedRoutes: jest.Mock;
    };
    let orsService: { proxyPost: jest.Mock };
    let queueService: {
        ensureQueue: jest.Mock;
        enqueue: jest.Mock;
        readOne: jest.Mock;
        archive: jest.Mock;
        deleteMsg: jest.Mock;
    };

    beforeEach(async () => {
        dsQuery = jest.fn().mockResolvedValue(WAREHOUSE_ROWS);
        queueService = {
            ensureQueue: jest.fn().mockResolvedValue(undefined),
            enqueue: jest.fn().mockResolvedValue(undefined),
            readOne: jest.fn().mockResolvedValue(null),
            archive: jest.fn().mockResolvedValue(undefined),
            deleteMsg: jest.fn().mockResolvedValue(undefined),
        };
        dbService = {
            beginTransaction: jest.fn(),
            buildOptimizationRequest: jest.fn(),
            insertOptimisedRoutes: jest.fn().mockResolvedValue(undefined),
        };
        orsService = { proxyPost: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TasksService,
                { provide: getDataSourceToken(), useValue: { query: dsQuery } },
                { provide: DatabaseService, useValue: dbService },
                { provide: OrsService, useValue: orsService },
                { provide: QueueService, useValue: queueService },
            ],
        }).compile();

        service = module.get<TasksService>(TasksService);
    });

    // ---------------------------------------------------------------------------
    // onApplicationBootstrap
    // ---------------------------------------------------------------------------
    describe('onApplicationBootstrap', () => {
        it('ensures queue and populates the warehouse cache', async () => {
            await service.onApplicationBootstrap();
            expect(queueService.ensureQueue).toHaveBeenCalled();
            expect(dsQuery).toHaveBeenCalledWith(
                expect.stringContaining('warehouse w'),
            );
        });
    });

    // ---------------------------------------------------------------------------
    // handleCron
    // ---------------------------------------------------------------------------
    describe('handleCron', () => {
        it('refreshes warehouse cache when TTL has expired (fresh start)', async () => {
            dsQuery.mockResolvedValue([]);
            await service.handleCron();
            expect(dsQuery).toHaveBeenCalledWith(
                expect.stringContaining('warehouse w'),
            );
        });

        it('does not re-fetch cache when it was recently built', async () => {
            // Populate the cache first — this sets cacheBuiltAt to now.
            await service.onApplicationBootstrap();
            const callCountAfterBoot = dsQuery.mock.calls.length;
            // handleCron within the same second — TTL (1hr) has not expired.
            await service.handleCron();
            // At most one additional query may occur (scheduler_runs insert), but the
            // warehouse refresh SQL should NOT be called again.
            const newCalls = dsQuery.mock.calls
                .slice(callCountAfterBoot)
                .filter((c: unknown[]) => String(c[0]).includes('warehouse w'));
            expect(newCalls).toHaveLength(0);
        });
    });

    // ---------------------------------------------------------------------------
    // handleQueue
    // ---------------------------------------------------------------------------
    describe('handleQueue', () => {
        it('returns immediately when the queue is empty', async () => {
            queueService.readOne.mockResolvedValueOnce(null);
            await service.handleQueue();
            expect(dbService.beginTransaction).not.toHaveBeenCalled();
        });

        it('rolls back and archives when runOptimization finds no jobs', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(1),
                read_ct: 0,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            const runner = makeRunner();
            dbService.beginTransaction.mockResolvedValueOnce(runner);
            dbService.buildOptimizationRequest.mockResolvedValueOnce({
                request: { jobs: [], vehicles: [] },
                vehicleMap: {},
                jobMap: {},
                driverMap: {},
            });
            // scheduler_runs UPDATE after success
            dsQuery.mockResolvedValue([]);

            await service.handleQueue();

            expect(runner.rollbackTransaction).toHaveBeenCalled();
            expect(queueService.archive).toHaveBeenCalledWith(BigInt(1));
        });

        it('commits and archives when optimization succeeds with jobs', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(2),
                read_ct: 0,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            const runner = makeRunner();
            dbService.beginTransaction.mockResolvedValueOnce(runner);
            dbService.buildOptimizationRequest.mockResolvedValueOnce({
                request: {
                    jobs: [{ id: 1, service: 900, location: [151.2, -33.8], amount: [2000], priority: 50 }],
                    vehicles: [
                        {
                            id: 1,
                            profile: 'driving-car',
                            start: [151.0, -33.7],
                            end: [151.0, -33.7],
                            capacity: [5000],
                        },
                    ],
                },
                vehicleMap: { 1: 'veh-1' },
                jobMap: { 1: 'pkg-1' },
                driverMap: { 1: 'drv-1' },
            });
            orsService.proxyPost.mockResolvedValueOnce({
                summary: { cost: 100, routes: 1, unassigned: 0 },
                routes: [
                    {
                        vehicle: 1,
                        cost: 100,
                        delivery: [0],
                        pickup: [0],
                        service: 0,
                        duration: 3600,
                        waiting_time: 0,
                        steps: [],
                    },
                ],
                unassigned: [],
            });
            dsQuery.mockResolvedValue([]);

            await service.handleQueue();

            expect(runner.commitTransaction).toHaveBeenCalled();
            expect(queueService.archive).toHaveBeenCalledWith(BigInt(2));
        });

        it('increments retry count and does NOT delete before MAX_RETRIES', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(3),
                read_ct: 0,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            dbService.beginTransaction.mockRejectedValueOnce(new Error('DB connection lost'));
            // UPDATE scheduler_runs SET retry_count = retry_count + 1 → below MAX_RETRIES
            dsQuery.mockResolvedValue([{ retry_count: 1 }]);

            await service.handleQueue();

            expect(queueService.deleteMsg).not.toHaveBeenCalled();
            expect(queueService.archive).not.toHaveBeenCalled();
        });

        it('deletes message and marks run failed when MAX_RETRIES is reached', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(4),
                read_ct: 2,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            dbService.beginTransaction.mockRejectedValueOnce(new Error('Persistent failure'));
            // retry_count has reached MAX_RETRIES (3)
            dsQuery.mockResolvedValue([{ retry_count: 3 }]);

            await service.handleQueue();

            expect(queueService.deleteMsg).toHaveBeenCalledWith(BigInt(4));
        });

        it('falls back to MAX_RETRIES when scheduler_runs UPDATE returns no rows', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(5),
                read_ct: 0,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            dbService.beginTransaction.mockRejectedValueOnce(new Error('Connection lost'));
            // UPDATE returned no rows — rows[0] is undefined, falls back to MAX_RETRIES
            dsQuery.mockResolvedValue([]);

            await service.handleQueue();

            // MAX_RETRIES fallback means permanent failure path is taken
            expect(queueService.deleteMsg).toHaveBeenCalledWith(BigInt(5));
        });

        it('calls GeoJSON directions when route has at least two distinct step locations', async () => {
            queueService.readOne.mockResolvedValueOnce({
                msg_id: BigInt(6),
                read_ct: 0,
                enqueued_at: new Date(),
                vt: new Date(),
                message: { warehouseId: 'wh-1', runDate: '2026-05-09' },
            });
            const runner = makeRunner();
            dbService.beginTransaction.mockResolvedValueOnce(runner);
            dbService.buildOptimizationRequest.mockResolvedValueOnce({
                request: {
                    jobs: [{ id: 1, service: 900, location: [151.2, -33.8], amount: [1000], priority: 50 }],
                    vehicles: [{ id: 1, profile: 'driving-car', start: [151.0, -33.7], end: [151.0, -33.7], capacity: [5000] }],
                },
                vehicleMap: { 1: 'veh-1' },
                jobMap: { 1: 'pkg-1' },
                driverMap: { 1: 'drv-1' },
            });
            // First call: optimization response with steps containing two distinct locations.
            orsService.proxyPost.mockResolvedValueOnce({
                summary: { cost: 200 },
                routes: [
                    {
                        vehicle: 1,
                        cost: 200,
                        delivery: [0],
                        pickup: [0],
                        service: 0,
                        duration: 3600,
                        waiting_time: 0,
                        steps: [
                            { type: 'start', location: [151.0, -33.7] },
                            { type: 'job', id: 1, location: [151.2, -33.8] },
                            { type: 'end', location: [151.0, -33.7] },
                        ],
                    },
                ],
                unassigned: [],
            });
            // Second call: GeoJSON directions response (any value is fine).
            orsService.proxyPost.mockResolvedValueOnce({ type: 'FeatureCollection', features: [] });
            dsQuery.mockResolvedValue([]);

            await service.handleQueue();

            // proxyPost should have been called twice: once for optimization and once for GeoJSON.
            expect(orsService.proxyPost).toHaveBeenCalledTimes(2);
            expect(runner.commitTransaction).toHaveBeenCalled();
        });
    });
});
