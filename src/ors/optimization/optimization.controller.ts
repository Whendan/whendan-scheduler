import { Controller, Post, Body, Headers, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { OptimizationResponse } from '../ors.types';


@UseGuards(AuthGuard)
@Controller('optimization')
export class OptimizationController {
    constructor(
        private readonly orsService: OrsService
    ) { }

    /**
     * Optimization Service (VROOM-based VRP solver) – assigns jobs and
     * shipments to vehicles while respecting time windows, capacities,
     * and skills.
     *
     * All timings are in seconds; all distances are in metres.
     * Coordinate order is [lon, lat].
     */
    @Post()
    optimize(
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<OptimizationResponse> {
        return this.orsService.proxyPost(
            '/optimization',
            body,
            auth,
        ) as Promise<OptimizationResponse>;
    }
}

