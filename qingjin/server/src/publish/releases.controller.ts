import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import { PublishService } from './publish.service';

class ListReleasesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

class PublishDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

const PREVIEW_LINK_TTL_S = 600;

@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly publish: PublishService,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  list(@Query() q: ListReleasesQuery) {
    return this.publish.list(q.page, q.pageSize);
  }

  // Fixed paths before ':id'.
  @Get('pending')
  pending() {
    return this.publish.pending();
  }

  @Get('preview')
  previewState() {
    return this.publish.previewState();
  }

  @Editor()
  @Post('preview')
  @HttpCode(202)
  startPreview(@CurrentUser() user: AuthUser) {
    return this.publish.startPreview(user.username);
  }

  /** One-time-ish link (10 min) that the preview host exchanges for a session cookie. */
  @Post('preview/link')
  @HttpCode(200)
  async previewLink() {
    const t = await this.jwt.signAsync({ scope: 'preview-link' }, { audience: 'preview-link', expiresIn: PREVIEW_LINK_TTL_S });
    const base = (process.env.PREVIEW_PUBLIC_URL ?? `http://localhost:${process.env.PREVIEW_PORT ?? 4400}`).replace(/\/$/, '');
    return { url: `${base}/__preview_auth?t=${encodeURIComponent(t)}`, expiresIn: PREVIEW_LINK_TTL_S };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.publish.get(id);
  }

  @Editor()
  @Post()
  @HttpCode(202)
  create(@Body() dto: PublishDto, @CurrentUser() user: AuthUser) {
    return this.publish.publish(dto.note, user.id);
  }

  @Editor()
  @Post(':id/rollback')
  @HttpCode(202)
  rollback(@Param('id') id: string, @Body() dto: PublishDto, @CurrentUser() user: AuthUser) {
    return this.publish.rollback(id, dto.note, user.id);
  }
}
