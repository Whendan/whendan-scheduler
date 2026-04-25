import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';

@UseGuards(AuthGuard)
@Controller()
export class StatusController {
    constructor(private readonly orsService: OrsService) { }

    /** Status Service – returns information about loaded profiles and limits. */
    @Get('v2/status')
    status(@Headers('authorization') auth?: string): Promise<unknown> {
        return this.orsService.proxyGet('/v2/status', {}, auth);
    }

    /** Health Service – returns current health of the ORS instance. */
    @Get('v2/health')
    health(@Headers('authorization') auth?: string): Promise<unknown> {
        return this.orsService.proxyGet('/v2/health', {}, auth);
    }
}
