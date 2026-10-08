import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications') @ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string) { return this.svc.list(u.id, unread === 'true'); }
  @Get('unread-count') async count(@CurrentUser() u: AuthUser) { return { count: await this.svc.unreadCount(u.id) }; }
  @Patch('read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u.id); }
  @Patch(':id/read') read(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.markRead(u.id, id); }
}
