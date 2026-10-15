import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import { ListMediaQuery, UploadMediaDto } from './media.dto';
import { MediaService } from './media.service';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@Query() query: ListMediaQuery) {
    return this.media.list(query);
  }

  @Editor()
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadMediaDto, @CurrentUser() user: AuthUser) {
    return this.media.upload(file, dto, user.id);
  }

  @Get(':id/usages')
  usages(@Param('id') id: string) {
    return this.media.usages(id);
  }

  @Editor()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.media.remove(id, user.id);
  }
}
