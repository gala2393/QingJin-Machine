import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import { CreateVideoUploadDto } from './videos.dto';
import { VideosService } from './videos.service';

/** Chunked, resumable upload: create -> PUT each chunk (application/octet-stream) -> complete. */
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Editor()
  @Post()
  create(@Body() dto: CreateVideoUploadDto, @CurrentUser() user: AuthUser) {
    return this.videos.create(dto, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.videos.status(id);
  }

  @Editor()
  @Put(':id/chunks/:index')
  @HttpCode(204)
  async chunk(@Param('id') id: string, @Param('index', ParseIntPipe) index: number, @Req() req: Request) {
    await this.videos.putChunk(id, index, req.body);
  }

  @Editor()
  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.videos.complete(id, user.id);
  }

  @Editor()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.videos.remove(id, user.id);
  }
}
