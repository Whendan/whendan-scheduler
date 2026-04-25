import { Controller, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { SnapResponse, GeoJSONSnapResponse } from '../ors.types';

@UseGuards(AuthGuard)
@Controller('v2/snap')
export class SnapController {
    constructor(private readonly orsService: OrsService) { }

    /** Snapping Service – default response format */
    @Post(':profile')
    snap(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<SnapResponse> {
        return this.orsService.proxyPost(
            `/v2/snap/${profile}`,
            body,
            auth,
        ) as Promise<SnapResponse>;
    }

    /** Snapping Service – explicit JSON format */
    @Post(':profile/json')
    snapJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<SnapResponse> {
        return this.orsService.proxyPost(
            `/v2/snap/${profile}/json`,
            body,
            auth,
        ) as Promise<SnapResponse>;
    }

    /** Snapping Service – GeoJSON format */
    @Post(':profile/geojson')
    snapGeoJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<GeoJSONSnapResponse> {
        return this.orsService.proxyPost(
            `/v2/snap/${profile}/geojson`,
            body,
            auth,
        ) as Promise<GeoJSONSnapResponse>;
    }
}

