import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { BookingsService } from './bookings.service';

class ResourceReqDto { @IsUUID() categoryId: string; @IsInt() @Min(0) @Max(200) quantity: number }
export class BookingDto {
  @IsString() @MinLength(2) @MaxLength(40) staffId: string;
  @IsString() @MinLength(2) @MaxLength(120) department: string;
  @IsString() @MinLength(2) @MaxLength(150) course: string;
  @IsString() @MinLength(2) @MaxLength(30) moduleCode: string;
  @IsString() @MinLength(3) @MaxLength(500) purpose: string;
  @IsString() @MinLength(1) @MaxLength(40) batchYear: string;
  @IsInt() @Min(1) @Max(500) studentCount: number;
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsInt() @Min(0) @Max(200) computersNeeded?: number;
  @IsOptional() @IsString() @MaxLength(500) software?: string;
  @IsOptional() @IsString() @MaxLength(500) osSpecs?: string;
  @IsOptional() @IsString() @MaxLength(1000) specialRequirements?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ResourceReqDto) resources?: ResourceReqDto[];
}
class CheckDto {
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsInt() @Min(0) computersNeeded?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ResourceReqDto) resources?: ResourceReqDto[];
}
class DecideDto { @IsBoolean() approve: boolean; @IsOptional() @IsString() @MaxLength(500) reason?: string }
class CancelDto { @IsOptional() @IsString() @MaxLength(500) reason?: string }

@ApiTags('Lab bookings') @ApiBearerAuth()
@Controller()
export class BookingsController {
  constructor(private svc: BookingsService) {}

  @Get('bookings/hours') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) hours() { return this.svc.labHours(); }
  @Get('bookings/slots') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) slots(@Query('date') date: string) { return this.svc.slots(date); }
  @Get('bookings/calendar') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) calendar(@Query('from') from: string, @Query('to') to: string) { return this.svc.calendar(from, to); }
  @Post('bookings/check') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) check(@Body() d: CheckDto) { return this.svc.availability(d); }

  @Get('bookings') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) list(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.list(u, q); }
  @Get('bookings/:id') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL) get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }

  @Post('bookings') @RequirePermissions(PERMISSIONS.BOOKING_REQUEST)
  create(@CurrentUser() u: AuthUser, @Body() d: BookingDto, @Meta() m: ReqMeta) { return this.svc.create(u, d, m); }

  @Patch('bookings/:id') @RequirePermissions(PERMISSIONS.BOOKING_REQUEST)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: BookingDto, @Meta() m: ReqMeta) { return this.svc.update(u, id, d, m); }

  @Post('bookings/:id/decision') @RequirePermissions(PERMISSIONS.BOOKING_DECIDE)
  decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: DecideDto, @Meta() m: ReqMeta) { return this.svc.decide(u, id, d.approve, d.reason, m); }

  @Post('bookings/:id/cancel') @RequirePermissions(PERMISSIONS.BOOKING_READ_ALL)
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: CancelDto, @Meta() m: ReqMeta) { return this.svc.cancel(u, id, d.reason, m); }

  @Get('reservations') @RequirePermissions(PERMISSIONS.ASSET_WRITE) reservations() { return this.svc.reservations(); }
}
