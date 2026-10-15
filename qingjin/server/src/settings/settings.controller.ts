import { Body, Controller, Get, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, Editor, Public } from '../auth/decorators';
import { SiteSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Login-page footer; only fields the public website already shows. */
  @Public()
  @Get('public')
  getPublic() {
    return this.settings.getPublic();
  }

  @Get('site')
  getSite() {
    return this.settings.getSite();
  }

  @Editor()
  @Put('site')
  putSite(@Body() dto: SiteSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.putSite(dto, user.id);
  }
}
