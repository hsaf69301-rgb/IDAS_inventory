import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AssetCondition } from '@prisma/client';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { LoansService } from './loans.service';

class LoanItemDto { @IsUUID() assetId: string; @IsOptional() @IsInt() @Min(1) quantity?: number }
class CreateLoanDto {
  @IsString() @MinLength(3) @MaxLength(500) purpose: string;
  @IsString() @MinLength(2) @MaxLength(200) useLocation: string;
  @IsDateString() requiredFrom: string;
  @IsDateString() dueAt: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => LoanItemDto) items: LoanItemDto[];
}
class DecideDto { @IsBoolean() approve: boolean; @IsOptional() @IsString() @MaxLength(500) reason?: string }
class IssueDto { @IsOptional() @IsString() @MaxLength(500) accessories?: string; @IsOptional() @IsObject() conditions?: Record<string, AssetCondition> }
class ReturnDto { @IsOptional() @IsObject() conditions?: Record<string, AssetCondition>; @IsOptional() @IsString() @MaxLength(500) missingAccessories?: string }
class InspectDto {
  @IsOptional() @IsUUID() loanId?: string;
  @IsBoolean() passed: boolean;
  @IsEnum(AssetCondition) conditionFound: AssetCondition;
  @IsOptional() @IsString() @MaxLength(1000) damageNotes?: string;
}

@ApiTags('Loans') @ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private svc: LoansService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.list(u, q); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }

  @Post() @RequirePermissions(PERMISSIONS.LOAN_REQUEST)
  create(@CurrentUser() u: AuthUser, @Body() d: CreateLoanDto, @Meta() m: ReqMeta) { return this.svc.create(u, d, m); }

  @Post(':id/decision') @RequirePermissions(PERMISSIONS.LOAN_MANAGE)
  decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: DecideDto, @Meta() m: ReqMeta) { return this.svc.decide(u, id, d.approve, d.reason, m); }

  @Post(':id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) { return this.svc.cancel(u, id, m); }

  @Post(':id/issue') @RequirePermissions(PERMISSIONS.LOAN_MANAGE)
  issue(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: IssueDto, @Meta() m: ReqMeta) { return this.svc.issue(u, id, d, m); }

  @Post(':id/return') @RequirePermissions(PERMISSIONS.LOAN_MANAGE)
  ret(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ReturnDto, @Meta() m: ReqMeta) { return this.svc.receiveReturn(u, id, d, m); }

  @Post('inspect/:assetId') @RequirePermissions(PERMISSIONS.LOAN_MANAGE)
  inspect(@CurrentUser() u: AuthUser, @Param('assetId') assetId: string, @Body() d: InspectDto, @Meta() m: ReqMeta) { return this.svc.inspect(u, assetId, d, m); }

  @Post('jobs/overdue') @RequirePermissions(PERMISSIONS.LOAN_MANAGE)
  overdue() { return this.svc.markOverdue(); }
}
