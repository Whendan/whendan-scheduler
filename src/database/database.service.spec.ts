import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DatabaseService } from './database.service';

type MockRunner = {
    query: jest.Mock;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
};

function makeRunner(queryImpl?: jest.Mock): MockRunner {
    return {
        query: queryImpl ?? jest.fn().mockResolvedValue([]),
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
    };
}

describe('DatabaseService', () => {
    let service: DatabaseService;
    let dsQuery: jest.Mock;
    let dsCreateQueryRunner: jest.Mock;

    beforeEach(async () => {
        dsQuery = jest.fn().mockResolvedValue([{ id: 1 }]);
        const runner = makeRunner();
        dsCreateQueryRunner = jest.fn().mockReturnValue(runner);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DatabaseService,
                {
                    provide: getDataSourceToken(),
                    useValue: { query: dsQuery, createQueryRunner: dsCreateQueryRunner },
                },
            ],
        }).compile();

        service = module.get<DatabaseService>(DatabaseService);
    });

    // ---------------------------------------------------------------------------
    // onApplicationBootstrap
    // ---------------------------------------------------------------------------
    describe('onApplicationBootstrap', () => {
        it('resolves when the PENDING status row exists', async () => {
            dsQuery.mockResolvedValueOnce([{ id: 7 }]);
            await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
        });

        it('throws an Error when no PENDING status row is found', async () => {
            dsQuery.mockResolvedValueOnce([]);
            await expect(service.onApplicationBootstrap()).rejects.toThrow(
                "package_status row with enums = 'PENDING' not found.",
            );
        });
    });

    // ---------------------------------------------------------------------------
    // query
    // ---------------------------------------------------------------------------
    describe('query', () => {
        it('delegates to the underlying DataSource and returns rows', async () => {
            const rows = [{ id: 'r1' }, { id: 'r2' }];
            dsQuery.mockResolvedValueOnce(rows);
            const result = await service.query<{ id: string }>('SELECT 1', []);
            expect(result).toEqual(rows);
        });
    });

    // ---------------------------------------------------------------------------
    // beginTransaction
    // ---------------------------------------------------------------------------
    describe('beginTransaction', () => {
        it('connects the runner and starts a transaction', async () => {
            const runner = makeRunner();
            dsCreateQueryRunner.mockReturnValueOnce(runner);

            const result = await service.beginTransaction();

            expect(runner.connect).toHaveBeenCalled();
            expect(runner.startTransaction).toHaveBeenCalled();
            expect(result).toBe(runner);
        });
    });

    // ---------------------------------------------------------------------------
    // buildOptimizationRequest
    // ---------------------------------------------------------------------------
    describe('buildOptimizationRequest', () => {
        beforeEach(async () => {
            // Ensure pendingStatusId is set before these tests run.
            dsQuery.mockResolvedValueOnce([{ id: 1 }]);
            await service.onApplicationBootstrap();
        });

        it('throws when warehouse location cannot be determined', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([]) // no packages
                    .mockResolvedValueOnce([]), // no assignments
            );
            await expect(
                service.buildOptimizationRequest(runner as never),
            ).rejects.toThrow('Could not determine warehouse location');
        });

        it('returns a BuildResult with jobs and vehicles', async () => {
            const today = new Date();
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([
                        {
                            id: 'pkg-1',
                            tracking_number: 'TRK001',
                            created_at: today,
                            warehouse_id: 'wh-1',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                            weight_kg: 2,
                            scheduled_arrival: today.toISOString(),
                            customer_lon: 151.3,
                            customer_lat: -33.9,
                        },
                    ])
                    .mockResolvedValueOnce([
                        {
                            driver_id: 'drv-1',
                            vehicle_id: 'veh-1',
                            vehicle_gross_limits: 5000,
                            ors_vehicle_type: 'driving-car',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                        },
                    ]),
            );

            const result = await service.buildOptimizationRequest(runner as never);

            expect(result.request.jobs).toHaveLength(1);
            expect(result.request.vehicles).toHaveLength(1);
            expect(result.jobMap[1]).toBe('pkg-1');
            expect(result.vehicleMap[1]).toBe('veh-1');
        });

        it('assigns priority 100 to past-due packages', async () => {
            const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([
                        {
                            id: 'pkg-past',
                            tracking_number: 'TRK002',
                            created_at: new Date(),
                            warehouse_id: 'wh-1',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                            weight_kg: 1,
                            scheduled_arrival: pastDue.toISOString(),
                            customer_lon: 151.3,
                            customer_lat: -33.9,
                        },
                    ])
                    .mockResolvedValueOnce([
                        {
                            driver_id: 'drv-1',
                            vehicle_id: 'veh-1',
                            vehicle_gross_limits: 5000,
                            ors_vehicle_type: 'driving-car',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                        },
                    ]),
            );

            const result = await service.buildOptimizationRequest(runner as never);

            expect(result.request.jobs[0].priority).toBe(100);
        });

        it('skips packages with a future scheduled_arrival', async () => {
            const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([
                        {
                            id: 'pkg-future',
                            tracking_number: 'TRK003',
                            created_at: new Date(),
                            warehouse_id: 'wh-1',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                            weight_kg: 1,
                            scheduled_arrival: future.toISOString(),
                            customer_lon: 151.3,
                            customer_lat: -33.9,
                        },
                    ])
                    .mockResolvedValueOnce([
                        {
                            driver_id: 'drv-1',
                            vehicle_id: 'veh-1',
                            vehicle_gross_limits: 5000,
                            ors_vehicle_type: 'driving-car',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                        },
                    ]),
            );

            const result = await service.buildOptimizationRequest(runner as never);

            expect(result.request.jobs).toHaveLength(0);
        });

        it('falls back to vehicle warehouse coords when packages have none', async () => {
            const today = new Date();
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([
                        {
                            id: 'pkg-no-wh',
                            tracking_number: 'TRK004',
                            created_at: today,
                            warehouse_id: 'wh-1',
                            warehouse_lon: null,
                            warehouse_lat: null,
                            weight_kg: 1,
                            scheduled_arrival: today.toISOString(),
                            customer_lon: 151.3,
                            customer_lat: -33.9,
                        },
                    ])
                    .mockResolvedValueOnce([
                        {
                            driver_id: 'drv-1',
                            vehicle_id: 'veh-1',
                            vehicle_gross_limits: 5000,
                            ors_vehicle_type: 'driving-car',
                            warehouse_lon: 151.2,
                            warehouse_lat: -33.8,
                        },
                    ]),
            );

            const result = await service.buildOptimizationRequest(runner as never);

            // Vehicle warehouse coords used — start/end should be set
            expect(result.request.vehicles[0].start).toEqual([151.2, -33.8]);
        });
    });

    // ---------------------------------------------------------------------------
    // insertOptimisedRoutes
    // ---------------------------------------------------------------------------
    describe('insertOptimisedRoutes', () => {
        beforeEach(async () => {
            dsQuery.mockResolvedValueOnce([{ id: 1 }]);
            await service.onApplicationBootstrap();
        });

        it('inserts vrp_optimization and vrp_solution for an empty route set', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([{ id: 'opt-1' }]) // vrp_optimization INSERT
                    .mockResolvedValueOnce([{ id: 'sol-1' }]), // vrp_solution INSERT
            );

            await expect(
                service.insertOptimisedRoutes(
                    runner as never,
                    { jobs: [], vehicles: [] },
                    {
                        summary: { cost: 0, routes: 0, unassigned: 0 },
                        routes: [],
                        unassigned: [],
                    },
                    {},
                    {},
                    {},
                ),
            ).resolves.not.toThrow();
        });

        it('processes a route with job steps and upserts package assignments', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([{ id: 'opt-1' }])   // vrp_optimization
                    .mockResolvedValueOnce([{ id: 'sol-1' }])   // vrp_solution
                    .mockResolvedValueOnce([{ id: 'rt-1' }])    // vrp_route
                    .mockResolvedValueOnce([])                   // package_assignment upsert
                    .mockResolvedValueOnce([])                   // vrp_route_step batch insert
                    .mockResolvedValueOnce([]),                  // packages UPDATE
            );

            await expect(
                service.insertOptimisedRoutes(
                    runner as never,
                    { jobs: [{ id: 1, service: 900, location: [151.2, -33.8], amount: [1000], priority: 50 }], vehicles: [] },
                    {
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
                                steps: [
                                    {
                                        type: 'job' as const,
                                        id: 1,
                                        location: [151.2, -33.8] as [number, number],
                                        arrival: 0,
                                        duration: 900,
                                        setup: 0,
                                        service: 900,
                                        waiting_time: 0,
                                        load: [0],
                                    },
                                ],
                            },
                        ],
                        unassigned: [],
                    },
                    { 1: 'veh-1' },
                    { 1: 'pkg-1' },
                    { 1: 'drv-1' },
                ),
            ).resolves.not.toThrow();
        });

        it('throws when a job step has no corresponding entry in jobMap', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([{ id: 'opt-1' }])
                    .mockResolvedValueOnce([{ id: 'sol-1' }])
                    .mockResolvedValueOnce([{ id: 'rt-1' }]),
            );

            await expect(
                service.insertOptimisedRoutes(
                    runner as never,
                    { jobs: [], vehicles: [] },
                    {
                        summary: {},
                        routes: [
                            {
                                vehicle: 1,
                                cost: 0,
                                delivery: [0],
                                pickup: [0],
                                service: 0,
                                duration: 0,
                                waiting_time: 0,
                                steps: [
                                    {
                                        type: 'job' as const,
                                        id: 99, // no mapping in jobMap
                                        location: [151.2, -33.8] as [number, number],
                                        arrival: 0,
                                        duration: 0,
                                        setup: 0,
                                        service: 0,
                                        waiting_time: 0,
                                        load: null,
                                    },
                                ],
                            },
                        ],
                        unassigned: [],
                    },
                    {},
                    {}, // empty jobMap
                    {},
                ),
            ).rejects.toThrow('Missing package mapping for job id 99');
        });

        it('includes computing_times loading/solving/routing when present in summary', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([{ id: 'opt-2' }])
                    .mockResolvedValueOnce([{ id: 'sol-2' }]),
            );

            await expect(
                service.insertOptimisedRoutes(
                    runner as never,
                    { jobs: [], vehicles: [] },
                    {
                        summary: {
                            cost: 50,
                            routes: 0,
                            unassigned: 0,
                            // computing_times is not in the typed interface but VROOM includes it
                            computing_times: { loading: 10, solving: 20, routing: 5 },
                        } as never,
                        routes: [],
                        unassigned: [],
                    },
                    {},
                    {},
                    {},
                ),
            ).resolves.not.toThrow();

            // Verify the vrp_solution INSERT received the computing_times values
            const solInsertCall = runner.query.mock.calls.find((call: unknown[]) =>
                String(call[0]).includes('vrp_solution'),
            );
            expect(solInsertCall).toBeDefined();
            // loading=10, solving=20, routing=5 should appear in parameters
            expect(solInsertCall[1]).toContain(10);
            expect(solInsertCall[1]).toContain(20);
        });

        it('skips steps without a location and processes adjacent steps normally', async () => {
            const runner = makeRunner(
                jest.fn()
                    .mockResolvedValueOnce([{ id: 'opt-3' }])
                    .mockResolvedValueOnce([{ id: 'sol-3' }])
                    .mockResolvedValueOnce([{ id: 'rt-3' }])
                    .mockResolvedValueOnce([])   // vrp_route_step batch (only non-null-location steps)
                    .mockResolvedValueOnce([]),  // packages UPDATE
            );

            // Route has one step with no location (skipped) and one 'start' step with location.
            await expect(
                service.insertOptimisedRoutes(
                    runner as never,
                    { jobs: [], vehicles: [] },
                    {
                        summary: {},
                        routes: [
                            {
                                vehicle: 1,
                                cost: 0,
                                delivery: [0],
                                pickup: [0],
                                service: 0,
                                duration: 0,
                                waiting_time: 0,
                                steps: [
                                    {
                                        type: 'start' as const,
                                        location: null as never,   // skipped
                                        arrival: 0,
                                        duration: 0,
                                        setup: 0,
                                        service: 0,
                                        waiting_time: 0,
                                        load: null,
                                    },
                                    {
                                        type: 'start' as const,
                                        location: [151.0, -33.7] as [number, number],
                                        arrival: 0,
                                        duration: 0,
                                        setup: 0,
                                        service: 0,
                                        waiting_time: 0,
                                        load: 42 as never, // scalar load — exercises the non-array branch
                                    },
                                ],
                            },
                        ],
                        unassigned: [],
                    },
                    { 1: 'veh-1' },
                    {},
                    { 1: 'drv-1' },
                ),
            ).resolves.not.toThrow();
        });
    });
});
