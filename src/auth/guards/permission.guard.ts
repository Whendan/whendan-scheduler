import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSION_KEY } from 'src/auth/decorators/required-permission.decorator';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        @Inject(SUPABASE_CLIENT)
        private readonly supabase: SupabaseClient,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermission = this.reflector.get<string>(
            PERMISSION_KEY,
            context.getHandler(),
        );

        const request = context.switchToHttp().getRequest();
        const authHeader: string | undefined = request.headers['authorization'];

        if (!authHeader) {
            throw new UnauthorizedException('Missing Authorization header');
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            throw new UnauthorizedException('Invalid Authorization header format');
        }

        const token = parts[1];

        const { data, error } = await this.supabase.auth.getUser(token);
        if (error || !data.user) {
            throw new UnauthorizedException('Invalid or expired token');
        }

        request.user = data.user;

        if (!requiredPermission) {
            return true;
        }

        const { data: permRow } = await this.supabase
            .from('user_permission')
            .select('app_permission!inner(permission)')
            .eq('user_id', data.user.id)
            .eq('app_permission.permission', requiredPermission)
            .maybeSingle();

        if (!permRow) {
            throw new ForbiddenException(
                `Missing required permission: ${requiredPermission}`,
            );
        }

        return true;
    }
}
