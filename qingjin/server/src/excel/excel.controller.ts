import { BadRequestException, Controller, Get, HttpCode, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import type { MachineStatus } from '../generated/prisma/client';
import { ExcelService } from './excel.service';

class ExportQuery {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(['', 'PUBLISHED', 'DRAFT', 'HIDDEN']) status?: MachineStatus | '';
}

class ImportQuery {
  @IsOptional() @IsIn(['true', 'false']) dryRun?: string;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

  @Get('machines')
  async export(@Query() q: ExportQuery) {
    const buf = await this.excel.exportMachines({ categoryId: q.categoryId, status: q.status || undefined });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const name = `机型-${day}.xlsx`;
    return new StreamableFile(buf, {
      type: XLSX,
      disposition: `attachment; filename="machines-${day}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

  @Editor()
  @Post('machines/import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file: Express.Multer.File | undefined, @Query() q: ImportQuery, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('请选择要导入的 .xlsx 文件');
    return this.excel.importMachines(file.buffer, q.dryRun !== 'false', user.id);
  }
}
