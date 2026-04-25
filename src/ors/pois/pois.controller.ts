import { Controller, Post, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';

@UseGuards(AuthGuard)
@Controller('pois')
export class PoisController {
    constructor(private readonly orsService: OrsService) { }

    /**
     * POIs Service – returns points of interest around a geometry (bounding box,
     * polygon, or buffered line/point).
     *
     * Set `request` to:
     * - `'pois'`   – return POI features
     * - `'stats'`  – return category statistics for the area
     * - `'list'`   – return all available POI categories
     */
    @Post()
    pois(
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<unknown> {
        return this.orsService.proxyPost('/pois', body, auth);
    }
}

