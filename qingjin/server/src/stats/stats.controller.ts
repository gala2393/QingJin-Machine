import { Body, Controller, Get, Headers, HttpCode, Ip, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { StatsService } from './stats.service';
import { cleanEvent, isBot } from './track';

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** Beacon endpoint for the public site. Always 204 so bad or bot traffic learns nothing. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('track')
  @HttpCode(204)
  async track(@Body() body: unknown, @Ip() ip: string, @Headers('user-agent') ua = '', @Headers('cf-ipcountry') country?: string) {
    if (isBot(ua)) return;
    const ev = cleanEvent(body);
    if (ev) await this.stats.record(ev, ip, ua, country?.toUpperCase());
  }

  @Get('stats/overview')
  overview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.stats.overview(from || undefined, to || undefined);
  }

  @Get('stats/summary')
  summary() {
    return this.stats.summary();
  }
}
