import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { extname, join, resolve } from 'path';
import { Response } from 'express';
import { AuthUser, CurrentUser, Meta, ReqMeta, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from './assets.service';
import { CreateAssetDto, MoveAssetDto, SetStatusDto, UpdateAssetDto } from './assets.dto';

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
const ALLOWED = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['application/pdf', '.pdf']]);

@ApiTags('Assets') @ApiBearerAuth()
@Controller('assets')
export class AssetsController {
  constructor(private svc: AssetsService, private prisma: PrismaService, private audit: AuditService) {}

  @Get() @RequirePermissions(PERMISSIONS.ASSET_READ) list(@Query() q: any) { return this.svc.list(q); }

  @Get('by-tag/:tag') @RequirePermissions(PERMISSIONS.ASSET_READ)
  byTag(@Param('tag') tag: string) { return this.svc.get(tag); }

  @Get('documents/:docId/file') @RequirePermissions(PERMISSIONS.ASSET_READ)
  async file(@Param('docId') docId: string, @Res() res: Response) {
    const d = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!d) throw new NotFoundException();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.fileName)}"`);
    res.type(d.mimeType);
    return res.sendFile(d.storedName, { root: UPLOAD_DIR });
  }

  @Get(':id') @RequirePermissions(PERMISSIONS.ASSET_READ) get(@Param('id') id: string) { return this.svc.get(id); }
  @Get(':id/history') @RequirePermissions(PERMISSIONS.ASSET_READ) history(@Param('id') id: string) { return this.svc.history(id); }

  @Get(':id/qr') @RequirePermissions(PERMISSIONS.ASSET_READ)
  async qr(@Param('id') id: string, @Query('format') format: string, @Res() res: Response) {
    const r = await this.svc.qr(id);
    if (format === 'json') return res.json({ assetTag: r.assetTag, dataUrl: r.dataUrl });
    res.type('image/png').send(r.png);
  }

  @Post() @RequirePermissions(PERMISSIONS.ASSET_WRITE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAssetDto, @Meta() m: ReqMeta) { return this.svc.create(u.id, dto, m); }

  @Patch(':id') @RequirePermissions(PERMISSIONS.ASSET_WRITE)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAssetDto, @Meta() m: ReqMeta) { return this.svc.update(u.id, id, dto, m); }

  @Post(':id/move') @RequirePermissions(PERMISSIONS.ASSET_MOVE)
  move(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: MoveAssetDto, @Meta() m: ReqMeta) { return this.svc.move(u.id, id, dto, m); }

  @Post(':id/status') @RequirePermissions(PERMISSIONS.ASSET_WRITE)
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SetStatusDto, @Meta() m: ReqMeta) { return this.svc.setStatus(u.id, id, dto, m); }

  /** Soft delete only – records are never physically removed. */
  @Delete(':id') @RequirePermissions(PERMISSIONS.ASSET_WRITE)
  archive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) { return this.svc.archive(u.id, id, m); }

  @Post(':id/documents') @RequirePermissions(PERMISSIONS.ASSET_WRITE) @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_r, f, cb) => cb(null, randomBytes(16).toString('hex') + (ALLOWED.get(f.mimetype) ?? extname(f.originalname).toLowerCase())),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_r, f, cb) => (ALLOWED.has(f.mimetype) ? cb(null, true) : cb(new BadRequestException('Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed'), false)),
  }))
  async upload(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Meta() m: ReqMeta) {
    if (!file) throw new BadRequestException('No file uploaded');
    await this.prisma.asset.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: { assetId: id, fileName: file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 150), storedName: file.filename, mimeType: file.mimetype, sizeBytes: file.size, uploadedById: u.id },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      });
      await this.audit.log(tx, { userId: u.id, action: 'Document uploaded', module: 'assets', recordId: id, next: d, meta: m });
      return d;
    });
  }
}
