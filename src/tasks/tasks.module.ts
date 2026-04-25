import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { DatabaseModule } from '../database/database.module';
import { OrsModule } from '../ors/ors.module';

@Module({
    imports: [DatabaseModule, OrsModule],
    providers: [TasksService],
})
export class TasksModule { }