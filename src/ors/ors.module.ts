import { Module } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrsService } from './ors.service';
import { SnapController } from './snap/snap.controller';
import { MatrixController } from './matrix/matrix.controller';
import { MatchController } from './match/match.controller';
import { IsochronesController } from './isochrones/isochrones.controller';
import { DirectionsController } from './directions/directions.controller';
import { ExportController } from './export/export.controller';
import { GeocodeController } from './geocode/geocode.controller';
import { ElevationController } from './elevation/elevation.controller';
import { PoisController } from './pois/pois.controller';
import { OptimizationController } from './optimization/optimization.controller';
import { StatusController } from './status/status.controller';

@Module({
    controllers: [
        SnapController,
        MatrixController,
        MatchController,
        IsochronesController,
        DirectionsController,
        ExportController,
        GeocodeController,
        ElevationController,
        PoisController,
        OptimizationController,
        StatusController,
    ],
    providers: [OrsService, AuthGuard],
    exports: [OrsService],
})
export class OrsModule { }
