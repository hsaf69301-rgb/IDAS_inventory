import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DamageStatus, MaintenanceStatus, Priority, RecoveryStatus, Severity, AssetCondition } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { MaintenanceService } from './maintenance.service';

class CreateMaintDto {
  @IsUUID() assetId: string;
  @IsString() @MinLength(3) @MaxLength(1000) problem: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class AdvanceDto {
  @IsEnum(MaintenanceStatus) to: MaintenanceStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @IsString() @MaxLength(2000) diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(2000) actionTaken?: string;
  @IsOptional() @IsString() @MaxLength(500) partsUsed?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsString() @MaxLength(150) repairProvider?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() repairStart?: string;
  @IsOptional() @IsDateString() repairEnd?: string;
}
class VerifyDto {
  @IsString() @MinLength(3) @MaxLength(500) testPerformed: string;
  @IsBoolean() testPassed: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
}
class CreateDamageDto {
  @IsUUID() assetId: string;
  @IsString() @MinLength(3) @MaxLength(2000) description: string;
  @IsEnum(Severity) severity: Severity;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @IsUUID() associatedUserId?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
}
class UpdateDamageDto {
  @IsOptional() @IsEnum(DamageStatus) status?: DamageStatus;
  @IsOptional() @IsString() @MaxLength(2000) investigationNotes?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
}
class CreateLostDto {
  @IsUUID() assetId: string;
  @IsOptional() @IsString() @MaxLength(150) lastKnownUser?: string;
  @IsOptional() @IsString() @MaxLength(150) lastKnownLocation?: string;
  @IsOptional() @IsDateString() lastSeenAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) investigation?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() lost?: boolean;
}
class UpdateLostDto {
  @IsOptional() @IsEnum(RecoveryStatus) recovery?: RecoveryStatus;
  @IsOptional() @IsString() @MaxLength(2000) investigation?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@ApiTags('Maintenance') @ApiBearerAuth()
@Controller()
export class MaintenanceController {
  constructor(private svc: MaintenanceService) {}

  @Get('maintenance') @RequirePermissions(PERMISSIONS.MAINT_READ) list(@Query() q: any) { return this.svc.list(q); }
  @Get('maintenance/:id') @RequirePermissions(PERMISSIONS.MAINT_READ) get(@Param('id') id: string) { return this.svc.get(id); }
  @Post('maintenance') @RequirePermissions(PERMISSIONS.MAINT_REPORT)
  create(@CurrentUser() u: AuthUser, @Body() d: CreateMaintDto, @Meta() m: ReqMeta) { return this.svc.create(u.id, d, m); }
  @Post('maintenance/:id/advance') @RequirePermissions(PERMISSIONS.MAINT_MANAGE)
  advance(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: AdvanceDto, @Meta() m: ReqMeta) { return this.svc.advance(u.id, id, d, m); }
  @Post('maintenance/:id/verify') @RequirePermissions(PERMISSIONS.MAINT_VERIFY)
  verify(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: VerifyDto, @Meta() m: ReqMeta) { return this.svc.verify(u.id, id, d, m); }

  @Get('damage') @RequirePermissions(PERMISSIONS.DAMAGE_MANAGE) listDamage(@Query() q: any) { return this.svc.listDamage(q); }
  @Post('damage') @RequirePermissions(PERMISSIONS.DAMAGE_REPORT)
  createDamage(@CurrentUser() u: AuthUser, @Body() d: CreateDamageDto, @Meta() m: ReqMeta) { return this.svc.createDamage(u.id, d, m); }
  @Patch('damage/:id') @RequirePermissions(PERMISSIONS.DAMAGE_MANAGE)
  updateDamage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateDamageDto, @Meta() m: ReqMeta) { return this.svc.updateDamage(u.id, id, d, m); }

  @Get('lost') @RequirePermissions(PERMISSIONS.DAMAGE_MANAGE) listLost() { return this.svc.listLost(); }
  @Post('lost') @RequirePermissions(PERMISSIONS.DAMAGE_MANAGE)
  createLost(@CurrentUser() u: AuthUser, @Body() d: CreateLostDto, @Meta() m: ReqMeta) { return this.svc.createLost(u.id, d, m); }
  @Patch('lost/:id') @RequirePermissions(PERMISSIONS.DAMAGE_MANAGE)
  updateLost(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateLostDto, @Meta() m: ReqMeta) { return this.svc.updateLost(u.id, id, d, m); }
}
