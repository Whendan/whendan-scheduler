import { Controller, Get, Post, Query, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { ElevationResponse } from '../ors.types';
@UseGuards(AuthGuard)
@Controller('elevation')
export class ElevationController {
    constructor(private readonly orsService: OrsService) { }

    /**
     * Elevation Line Service – enrich a 2D line geometry with elevation data.
     * Accepts GeoJSON LineString, polyline array, or encoded polyline formats.
     */
    @Post('line')
    elevationLine(
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<ElevationResponse> {
        return this.orsService.proxyPost(
            '/elevation/line',
            body,
            auth,
        ) as Promise<ElevationResponse>;
    }

    /**
     * Elevation Point Service – GET variant.
     * Required query params: `geometry` (comma-separated lon,lat).
     */
    @Get('point')
    elevationPointGet(
        @Query() query: Record<string, string>,
        @Headers('authorization') auth?: string,
    ): Promise<ElevationResponse> {
        return this.orsService.proxyGet(
            '/elevation/point',
            query,
            auth,
        ) as Promise<ElevationResponse>;
    }

    /**
     * Elevation Point Service – POST variant.
     * Accepts GeoJSON Point or [lon, lat] array.
     */
    @Post('point')
    elevationPointPost(
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<ElevationResponse> {
        return this.orsService.proxyPost(
            '/elevation/point',
            body,
            auth,
        ) as Promise<ElevationResponse>;
    }
}

