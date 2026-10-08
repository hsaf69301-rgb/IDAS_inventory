import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StocktakeResult } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { StocktakesService } from './stocktakes.service';

class StartDto { @IsString() @MinLength(3) @MaxLength(150) title: string; @IsOptional() @IsUUID() locationId?: string }
class CheckDto {
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsString() @MaxLength(60) assetTag?: string;
  @IsEnum(StocktakeResult) result: StocktakeResult;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@ApiTags('Stocktakes') @ApiBearerAuth()
@Controller('stocktakes')
export class StocktakesController {
  constructor(private svc: StocktakesService) {}
  @Get() @RequirePermissions(PERMISSIONS.STOCKTAKE_MANAGE) list() { return this.svc.list(); }
  @Get(':id') @RequirePermissions(PERMISSIONS.STOCKTAKE_MANAGE) get(@Param('id') id: string) { return this.svc.get(id); }
  @Post() @RequirePermissions(PERMISSIONS.STOCKTAKE_MANAGE)
  start(@CurrentUser() u: AuthUser, @Body() d: StartDto, @Meta() m: ReqMeta) { return this.svc.start(u.id, d, m); }
  @Post(':id/check') @RequirePermissions(PERMISSIONS.STOCKTAKE_MANAGE)
  check(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: CheckDto, @Meta() m: ReqMeta) { return this.svc.check(u.id, id, d, m); }
  @Post(':id/complete') @RequirePermissions(PERMISSIONS.STOCKTAKE_MANAGE)
  complete(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) { return this.svc.complete(u.id, id, m); }
}
