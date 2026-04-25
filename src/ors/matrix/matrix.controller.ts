import { Controller, Post, Param, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OrsService } from '../ors.service';
import type { MatrixResponse } from '../ors.types';

@UseGuards(AuthGuard)
@Controller('v2/matrix')
export class MatrixController {
    constructor(private readonly orsService: OrsService) { }

    /**
     * Matrix Service – returns duration or distance matrix for multiple
     * source/destination pairs.
     */
    @Post(':profile')
    matrix(
        @Param('profile') profile: string,
        @Body() body: object,
        @Headers('authorization') auth?: string,
    ): Promise<MatrixResponse> {
        return this.orsService.proxyPost(
            `/v2/matrix/${profile}`,
            body,
            auth,
        ) as Promise<MatrixResponse>;
    }
}

