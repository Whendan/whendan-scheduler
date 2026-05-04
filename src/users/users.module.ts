import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from 'src/auth/guards/permission.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
    controllers: [UsersController],
    providers: [UsersService, PermissionGuard, Reflector],
})
export class UsersModule { }
