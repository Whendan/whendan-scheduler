import { Controller, Get, Post, Param, Body, Query, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { DirectionsResponse } from '../ors.types';

@UseGuards(AuthGuard)
@Controller('v2/directions')
export class DirectionsController {
    constructor(private readonly orsService: OrsService) { }

    /** Directions Service – GET variant with query parameters. */
    @Get(':profile')
    directionsGet(
        @Param('profile') profile: string,
        @Query() query: Record<string, string>,
        @Headers('authorization') auth?: string,
    ): Promise<DirectionsResponse> {
        return this.orsService.proxyGet(
            `/v2/directions/${profile}`,
            query,
            auth,
        ) as Promise<DirectionsResponse>;
    }

    /** Directions Service – default response format. */
    @Post(':profile')
    directions(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<DirectionsResponse> {
        return this.orsService.proxyPost(
            `/v2/directions/${profile}`,
            body,
            auth,
        ) as Promise<DirectionsResponse>;
    }

    /** Directions Service – explicit JSON response format. */
    @Post(':profile/json')
    directionsJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<DirectionsResponse> {
        return this.orsService.proxyPost(
            `/v2/directions/${profile}/json`,
            body,
            auth,
        ) as Promise<DirectionsResponse>;
    }

    /** Directions Service – GPX response format. */
    @Post(':profile/gpx')
    directionsGpx(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost(
            `/v2/directions/${profile}/gpx`,
            body,
            auth,
        );
    }

    /** Directions Service – GeoJSON response format. */
    @Post(':profile/geojson')
    directionsGeoJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost(
            `/v2/directions/${profile}/geojson`,
            body,
            auth,
        );
    }
}

