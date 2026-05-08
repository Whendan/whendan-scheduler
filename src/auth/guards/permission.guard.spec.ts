import { Test, TestingModule } from '@nestjs/testing';
import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';

type SupabaseMock = {
    auth: { getUser: jest.Mock };
    from: jest.Mock;
};

function makeFromChain(permRow: unknown) {
    return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: permRow }),
    };
}

function makeContext(authHeader: string | undefined): ExecutionContext {
    const req: Record<string, unknown> = {
        headers: { authorization: authHeader },
    };
    return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => ({}),
    } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
    let guard: PermissionGuard;
    let supabase: SupabaseMock;
    let reflector: { get: jest.Mock };

    beforeEach(async () => {
        supabase = { auth: { getUser: jest.fn() }, from: jest.fn() };
        reflector = { get: jest.fn() };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionGuard,
                { provide: SUPABASE_CLIENT, useValue: supabase },
                { provide: Reflector, useValue: reflector },
            ],
        }).compile();
        guard = module.get<PermissionGuard>(PermissionGuard);
    });

    it('throws UnauthorizedException when Authorization header is absent', async () => {
        await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('throws UnauthorizedException for non-bearer format', async () => {
        await expect(
            guard.canActivate(makeContext('ApiKey some-key')),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the header has only one part', async () => {
        await expect(
            guard.canActivate(makeContext('Bearer')),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when supabase returns an error', async () => {
        supabase.auth.getUser.mockResolvedValueOnce({
            data: null,
            error: new Error('token invalid'),
        });
        await expect(
            guard.canActivate(makeContext('Bearer bad-token')),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when supabase returns no user', async () => {
        supabase.auth.getUser.mockResolvedValueOnce({
            data: { user: null },
            error: null,
        });
        await expect(
            guard.canActivate(makeContext('Bearer bad-token')),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('returns true when no permission is required on the handler', async () => {
        reflector.get.mockReturnValueOnce(undefined);
        supabase.auth.getUser.mockResolvedValueOnce({
            data: { user: { id: 'u1' } },
            error: null,
        });
        const result = await guard.canActivate(makeContext('Bearer valid'));
        expect(result).toBe(true);
    });

    it('returns true when the user has the required permission', async () => {
        reflector.get.mockReturnValueOnce('team_members.add');
        supabase.auth.getUser.mockResolvedValueOnce({
            data: { user: { id: 'u1' } },
            error: null,
        });
        supabase.from.mockReturnValue(makeFromChain({ id: 'perm-1' }));
        const result = await guard.canActivate(makeContext('Bearer valid'));
        expect(result).toBe(true);
    });

    it('throws ForbiddenException when the user lacks the required permission', async () => {
        reflector.get.mockReturnValueOnce('team_members.delete');
        supabase.auth.getUser.mockResolvedValueOnce({
            data: { user: { id: 'u1' } },
            error: null,
        });
        supabase.from.mockReturnValue(makeFromChain(null));
        await expect(
            guard.canActivate(makeContext('Bearer valid')),
        ).rejects.toThrow(ForbiddenException);
    });
});
