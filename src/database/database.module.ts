import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from 'src/entities/package.entity';
import { PackageAssignment } from 'src/entities/package-assignment.entity';
import { PackageStatus } from 'src/entities/package-status.entity';
import { VrpOptimization } from 'src/entities/vrp-optimization.entity';
import { VrpRoute } from 'src/entities/vrp-route.entity';
import { VrpSolution } from 'src/entities/vrp-solution.entity';
import { DatabaseService } from './database.service';

@Module({
    imports: [TypeOrmModule.forFeature([PackageStatus, Package, PackageAssignment, VrpOptimization, VrpSolution, VrpRoute])],
    providers: [DatabaseService],
    exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule { }
