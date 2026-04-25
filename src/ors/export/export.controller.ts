import { Controller, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { ExportResponse } from '../ors.types';

@UseGuards(AuthGuard)
@Controller('v2/export')
export class ExportController {
    constructor(private readonly orsService: OrsService) { }

    /** Export Service – returns nodes, edges, and weights as JSON. */
    @Post(':profile')
    export(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<ExportResponse> {
        return this.orsService.proxyPost(
            `/v2/export/${profile}`,
            body,
            auth,
        ) as Promise<ExportResponse>;
    }

    /** Export Service – returns edges and their topology as TopoJSON. */
    @Post(':profile/topojson')
    exportTopoJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost(
            `/v2/export/${profile}/topojson`,
            body,
            auth,
        );
    }

    /** Export Service – returns nodes and edges as JSON (explicit). */
    @Post(':profile/json')
    exportJson(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<ExportResponse> {
        return this.orsService.proxyPost(
            `/v2/export/${profile}/json`,
            body,
            auth,
        ) as Promise<ExportResponse>;
    }
}

