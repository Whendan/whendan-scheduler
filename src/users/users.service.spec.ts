import { Test, TestingModule } from '@nestjs/testing';
import {
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { DatabaseService } from 'src/database/database.service';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';

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

const VALID_DTO = {
    user_email: 'user@example.com',
    user_display_name: 'Test User',
    user_phone_number: '+61400000000',
    user_role: 'Admin',
    user_permission: [] as string[],
};

describe('UsersService', () => {
    let service: UsersService;
    let db: { query: jest.Mock; beginTransaction: jest.Mock };
    let supabase: {
        auth: {
            admin: {
                inviteUserByEmail: jest.Mock;
                updateUserById: jest.Mock;
                deleteUser: jest.Mock;
                signOut: jest.Mock;
            };
        };
        storage: { from: jest.Mock };
    };

    beforeEach(async () => {
        db = { query: jest.fn(), beginTransaction: jest.fn() };
        supabase = {
            auth: {
                admin: {
                    inviteUserByEmail: jest.fn(),
                    updateUserById: jest.fn(),
                    deleteUser: jest.fn(),
                    signOut: jest.fn(),
                },
            },
            storage: { from: jest.fn() },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: SUPABASE_CLIENT, useValue: supabase },
                { provide: DatabaseService, useValue: db },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    // ---------------------------------------------------------------------------
    // createUser
    // ---------------------------------------------------------------------------
    describe('createUser', () => {
        it('throws BadRequestException when role does not exist', async () => {
            db.query.mockResolvedValueOnce([]);
            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('throws BadRequestException for unknown permissions', async () => {
            db.query
                .mockResolvedValueOnce([{ id: '1', name: 'Admin' }])
                .mockResolvedValueOnce([{ id: '10', permission: 'team_members.view' }]);
            await expect(
                service.createUser({
                    ...VALID_DTO,
                    user_permission: ['team_members.view', 'team_members.add'],
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException when email is already registered', async () => {
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: null,
                error: { message: 'User already registered' },
            });
            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('throws InternalServerErrorException when invite fails with unexpected error', async () => {
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: null,
                error: { message: 'Internal server error' },
            });
            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                InternalServerErrorException,
            );
        });

        it('throws InternalServerErrorException when phone update fails', async () => {
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: {
                    user: {
                        id: 'u1',
                        email: 'user@example.com',
                        invited_at: null,
                    },
                },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({
                error: { message: 'Phone update failed' },
            });
            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                InternalServerErrorException,
            );
        });

        it('rolls back and throws InternalServerErrorException on a generic DB error', async () => {
            const runner = makeRunner(
                jest.fn().mockRejectedValueOnce(new Error('connection reset')),
            );
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u1', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });
            supabase.auth.admin.deleteUser.mockResolvedValueOnce({ error: null });

            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                InternalServerErrorException,
            );
            expect(runner.rollbackTransaction).toHaveBeenCalled();
        });

        it('throws BadRequestException on FK violation during DB write', async () => {
            const runner = makeRunner(
                jest
                    .fn()
                    .mockRejectedValueOnce(
                        new Error('violates foreign key constraint "team_members_role_id_fkey"'),
                    ),
            );
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u1', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });
            supabase.auth.admin.deleteUser.mockResolvedValueOnce({ error: null });

            await expect(service.createUser(VALID_DTO)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('returns CreateUserResult on success', async () => {
            const runner = makeRunner();
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: {
                    user: {
                        id: 'u1',
                        email: 'user@example.com',
                        invited_at: '2026-01-01T00:00:00Z',
                    },
                },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });

            const result = await service.createUser(VALID_DTO);

            expect(result.user_id).toBe('u1');
            expect(result.user_email).toBe('user@example.com');
            expect(runner.commitTransaction).toHaveBeenCalled();
        });

        it('includes avatar upload URL when user_avatar is true', async () => {
            const runner = makeRunner();
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u1', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });
            supabase.storage.from.mockReturnValue({
                createSignedUploadUrl: jest.fn().mockResolvedValue({
                    data: { signedUrl: 'https://storage.example.com/upload' },
                    error: null,
                }),
            });

            const result = await service.createUser({ ...VALID_DTO, user_avatar: true });

            expect(result.user_avatar_upload_url).toBe(
                'https://storage.example.com/upload',
            );
        });

        it('throws InternalServerErrorException when avatar URL generation fails', async () => {
            const runner = makeRunner();
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u1', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });
            supabase.storage.from.mockReturnValue({
                createSignedUploadUrl: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Bucket not found' },
                }),
            });

            await expect(
                service.createUser({ ...VALID_DTO, user_avatar: true }),
            ).rejects.toThrow(InternalServerErrorException);
        });

        it('creates Driver user and inserts driver metadata', async () => {
            const runner = makeRunner();
            db.query.mockResolvedValueOnce([{ id: '2', name: 'Driver' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u2', email: 'driver@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });

            const result = await service.createUser({
                ...VALID_DTO,
                user_role: 'Driver',
                user_metadata: {
                    driver_license: 'DL123',
                    license_expiry: '2030-01-01',
                    country_of_issue: 'AU',
                    driver_under_probation: false,
                    license_type: 'C',
                },
            });

            expect(result.user_id).toBe('u2');
            // Driver INSERT should be one of the runner queries
            const driverInsertCall = runner.query.mock.calls.find((call: unknown[]) =>
                String(call[0]).includes('drivers'),
            );
            expect(driverInsertCall).toBeDefined();
        });

        it('inserts permission rows when user_permission is non-empty', async () => {
            const runner = makeRunner();
            db.query
                .mockResolvedValueOnce([{ id: '1', name: 'Admin' }])          // role lookup
                .mockResolvedValueOnce([{ id: '10', permission: 'packages.view' }]); // permission lookup
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u3', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });

            const result = await service.createUser({
                ...VALID_DTO,
                user_permission: ['packages.view'],
            });

            expect(result.user_id).toBe('u3');
            const permInsert = runner.query.mock.calls.find((call: unknown[]) =>
                String(call[0]).includes('user_permission'),
            );
            expect(permInsert).toBeDefined();
        });

        it('logs error when orphaned auth user cleanup also fails after DB error', async () => {
            const runner = makeRunner(
                jest.fn().mockRejectedValueOnce(new Error('constraint violation')),
            );
            db.query.mockResolvedValueOnce([{ id: '1', name: 'Admin' }]);
            db.beginTransaction.mockResolvedValueOnce(runner);
            supabase.auth.admin.inviteUserByEmail.mockResolvedValueOnce({
                data: { user: { id: 'u4', email: 'user@example.com', invited_at: null } },
                error: null,
            });
            supabase.auth.admin.updateUserById.mockResolvedValueOnce({ error: null });
            // Cleanup also fails
            supabase.auth.admin.deleteUser.mockResolvedValueOnce({
                error: { message: 'Auth service unavailable' },
            });

            await expect(service.createUser(VALID_DTO)).rejects.toThrow();
            expect(runner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------------------
    // deactivateUsers
    // ---------------------------------------------------------------------------
    describe('deactivateUsers', () => {
        const UID = '00000000-0000-0000-0000-000000000001';

        it('returns deactivated list with empty failed on success', async () => {
            supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
            supabase.auth.admin.signOut.mockResolvedValue({});

            const result = await service.deactivateUsers(
                { user_ids: [UID] },
                'caller-id',
            );

            expect(result.deactivated).toEqual([UID]);
            expect(result.failed).toHaveLength(0);
        });

        it('adds to failed when user tries to deactivate their own account', async () => {
            const result = await service.deactivateUsers({ user_ids: [UID] }, UID);

            expect(result.failed).toHaveLength(1);
            expect(result.failed[0].reason).toContain('Cannot deactivate your own account');
        });

        it('adds to failed when the ban call fails', async () => {
            supabase.auth.admin.updateUserById.mockResolvedValue({
                error: { message: 'User not found' },
            });

            const result = await service.deactivateUsers(
                { user_ids: [UID] },
                'caller-id',
            );

            expect(result.failed).toHaveLength(1);
            expect(result.deactivated).toHaveLength(0);
        });

        it('processes multiple users independently, collecting partial results', async () => {
            const UID2 = '00000000-0000-0000-0000-000000000002';
            supabase.auth.admin.updateUserById
                .mockResolvedValueOnce({ error: null })
                .mockResolvedValueOnce({ error: { message: 'Not found' } });
            supabase.auth.admin.signOut.mockResolvedValue({});

            const result = await service.deactivateUsers(
                { user_ids: [UID, UID2] },
                'caller-id',
            );

            expect(result.deactivated).toHaveLength(1);
            expect(result.failed).toHaveLength(1);
        });
    });

    // ---------------------------------------------------------------------------
    // reactivateUsers
    // ---------------------------------------------------------------------------
    describe('reactivateUsers', () => {
        const UID = '00000000-0000-0000-0000-000000000001';

        it('returns reactivated list with empty failed on success', async () => {
            supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

            const result = await service.reactivateUsers({ user_ids: [UID] });

            expect(result.reactivated).toEqual([UID]);
            expect(result.failed).toHaveLength(0);
        });

        it('adds to failed when the unban call fails', async () => {
            supabase.auth.admin.updateUserById.mockResolvedValue({
                error: { message: 'User not found' },
            });

            const result = await service.reactivateUsers({ user_ids: [UID] });

            expect(result.failed).toHaveLength(1);
            expect(result.reactivated).toHaveLength(0);
        });
    });
});
