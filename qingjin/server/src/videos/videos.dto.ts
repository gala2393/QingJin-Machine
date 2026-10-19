import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MAX_VIDEO_BYTES = 600 * 1024 * 1024;
export const VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;

export class CreateVideoUploadDto {
  @IsString()
  @MaxLength(200)
  fileName: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES, { message: '视频不能超过 600 MB' })
  size: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mime?: string;
}
