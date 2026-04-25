import { Controller, Get, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';

@UseGuards(AuthGuard)
@Controller('v2/match')
export class MatchController {
    constructor(private readonly orsService: OrsService) { }

    /** Matching Service information – graph metadata. */
    @Get(':profile')
    matchInfo(
        @Param('profile') profile: string,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyGet(`/v2/match/${profile}`, {}, auth);
    }

    /**
     * Matching Service – match point/linestring/polygon geometries
     * to edge IDs of the routing graph.
     */
    @Post(':profile')
    match(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost(`/v2/match/${profile}`, body, auth);
    }
}

