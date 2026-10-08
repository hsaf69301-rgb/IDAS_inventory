import { Module } from '@nestjs/common';
import { StocktakesController } from './stocktakes.controller';
import { StocktakesService } from './stocktakes.service';

@Module({ controllers: [StocktakesController], providers: [StocktakesService], exports: [StocktakesService] })
export class StocktakesModule {}
