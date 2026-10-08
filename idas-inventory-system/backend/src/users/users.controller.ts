import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { UsersService } from './users.service';

const PW = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsEnum(RoleName) role: RoleName;
  @IsOptional() @IsString() @MaxLength(40) universityId?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsString() @MinLength(10) @MaxLength(128) @Matches(PW, { message: 'Password needs upper-case, lower-case and a digit' }) password: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsEnum(RoleName) role?: RoleName;
  @IsOptional() @IsString() @MaxLength(40) universityId?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(128) @Matches(PW) password?: string;
}

@ApiTags('Users') @ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}
  @Get() @RequirePermissions(PERMISSIONS.USER_READ) list(@Query() q: any) { return this.svc.list(q); }
  @Get(':id') @RequirePermissions(PERMISSIONS.USER_READ) get(@Param('id') id: string) { return this.svc.get(id); }
  @Post() @RequirePermissions(PERMISSIONS.USER_WRITE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto, @Meta() m: ReqMeta) { return this.svc.create(u.id, dto, m); }
  @Patch(':id') @RequirePermissions(PERMISSIONS.USER_WRITE)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto, @Meta() m: ReqMeta) { return this.svc.update(u.id, id, dto, m); }
}
