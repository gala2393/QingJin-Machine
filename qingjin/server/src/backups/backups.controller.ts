import { Controller, Get, HttpCode, Param, Post, StreamableFile } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { BackupsService } from './backups.service';

@Roles('SUPER_ADMIN')
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  status() {
    return this.backups.status();
  }

  @Post('run')
  @HttpCode(202)
  run(@CurrentUser() me: AuthUser) {
    return this.backups.requestRun(me.id);
  }

  @Get(':name')
  async download(@Param('name') name: string, @CurrentUser() me: AuthUser) {
    const { stream, size } = await this.backups.open(name, me.id);
    return new StreamableFile(stream, { type: 'application/octet-stream', length: size, disposition: `attachment; filename="${name}"` });
  }
}
