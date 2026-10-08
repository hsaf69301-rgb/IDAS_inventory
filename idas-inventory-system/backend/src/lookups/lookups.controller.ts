import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';

class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @Matches(/^[A-Z0-9]{2,8}$/, { message: 'Code must be 2-8 upper-case letters/digits' }) code: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}
class LocationDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEnum(LocationType) type: LocationType;
  @IsOptional() @IsUUID() parentId?: string;
}
class SettingDto { @IsString() @MaxLength(500) value: string }

@ApiTags('Lookups') @ApiBearerAuth()
@Controller()
export class LookupsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('roles') @RequirePermissions(PERMISSIONS.ROLE_READ)
  roles() {
    return this.prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { label: 'asc' } })
      .then((rs) => rs.map((r) => ({ id: r.id, name: r.name, label: r.label, userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.code).sort() })));
  }
  @Get('permissions') @RequirePermissions(PERMISSIONS.ROLE_READ)
  permissions() { return this.prisma.permission.findMany({ orderBy: { code: 'asc' } }); }

  @Get('departments') departments() { return this.prisma.department.findMany({ orderBy: { name: 'asc' } }); }

  @Get('categories') categories() { return this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { assets: true } } } }); }
  @Post('categories') @RequirePermissions(PERMISSIONS.LOOKUP_WRITE)
  async createCategory(@CurrentUser() u: AuthUser, @Body() dto: CategoryDto, @Meta() m: ReqMeta) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: dto });
      await this.audit.log(tx, { userId: u.id, action: 'Category created', module: 'categories', recordId: c.id, next: dto, meta: m });
      return c;
    });
  }
  @Patch('categories/:id') @RequirePermissions(PERMISSIONS.LOOKUP_WRITE)
  async updateCategory(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CategoryDto, @Meta() m: ReqMeta) {
    const before = await this.prisma.category.findUniqueOrThrow({ where: { id } });
    // The code is embedded in existing asset tags, so it is immutable.
    if (dto.code !== before.code) throw new BadRequestException('Category code cannot be changed once created');
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.category.update({ where: { id }, data: { name: dto.name, description: dto.description } });
      await this.audit.log(tx, { userId: u.id, action: 'Category updated', module: 'categories', recordId: id, previous: before, next: c, meta: m });
      return c;
    });
  }

  @Get('locations') locations() { return this.prisma.location.findMany({ orderBy: { name: 'asc' }, include: { parent: { select: { name: true } }, _count: { select: { assets: true } } } }); }
  @Post('locations') @RequirePermissions(PERMISSIONS.LOOKUP_WRITE)
  async createLocation(@CurrentUser() u: AuthUser, @Body() dto: LocationDto, @Meta() m: ReqMeta) {
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.location.create({ data: dto });
      await this.audit.log(tx, { userId: u.id, action: 'Location created', module: 'locations', recordId: l.id, next: dto, meta: m });
      return l;
    });
  }
  @Patch('locations/:id') @RequirePermissions(PERMISSIONS.LOOKUP_WRITE)
  async updateLocation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LocationDto, @Meta() m: ReqMeta) {
    if (dto.parentId === id) throw new BadRequestException('A location cannot be its own parent');
    const before = await this.prisma.location.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      const l = await tx.location.update({ where: { id }, data: { name: dto.name, type: dto.type, parentId: dto.parentId ?? null } });
      await this.audit.log(tx, { userId: u.id, action: 'Location updated', module: 'locations', recordId: id, previous: before, next: l, meta: m });
      return l;
    });
  }

  @Get('settings') @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async settings() { return this.prisma.setting.findMany({ where: { key: { startsWith: 'app.' } }, orderBy: { key: 'asc' } }); }
  @Put('settings/:key') @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async putSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: SettingDto, @Meta() m: ReqMeta) {
    if (!/^app\.[a-zA-Z0-9_.]+$/.test(key)) throw new BadRequestException('Setting keys must start with "app."');
    const before = await this.prisma.setting.findUnique({ where: { key } });
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.setting.upsert({ where: { key }, create: { key, value: dto.value }, update: { value: dto.value } });
      await this.audit.log(tx, { userId: u.id, action: 'Setting changed', module: 'settings', recordId: key, previous: before, next: s, meta: m });
      return s;
    });
  }
}
