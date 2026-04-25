import { Controller, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';

@UseGuards(AuthGuard)
@Controller('v2/isochrones')
export class IsochronesController {
    constructor(private readonly orsService: OrsService) { }

    /**
     * Isochrones Service – returns reachability areas from one or more
     * locations for a given time or distance range.
     */
    @Post(':profile')
    isochrones(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost(
            `/v2/isochrones/${profile}`,
            body,
            auth,
        );
    }
}

