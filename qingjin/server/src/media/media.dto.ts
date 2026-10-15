import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsJSON, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MEDIA_USAGES = ['machine', 'site'] as const;

export class ListMediaQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 40;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  unused?: boolean;

  @IsOptional()
  @IsIn(MEDIA_USAGES)
  usage?: (typeof MEDIA_USAGES)[number];
}

/** Multipart text fields that accompany the uploaded file. */
export class UploadMediaDto {
  @IsOptional()
  @IsJSON({ message: 'crop 必须是 JSON' })
  @MaxLength(200)
  crop?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  square?: 'true' | 'false';

  @IsOptional()
  @IsIn(MEDIA_USAGES)
  usage?: (typeof MEDIA_USAGES)[number];
}
