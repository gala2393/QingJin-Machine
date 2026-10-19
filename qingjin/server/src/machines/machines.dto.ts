import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PARAM_KEY_PATTERN, SLUG_PATTERN } from '../common/patterns';
import { MachineStatus } from '../generated/prisma/client';

export class ListMachinesQuery {
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
  pageSize = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(MachineStatus)
  status?: MachineStatus;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  featured?: boolean;

  /** "pending": drafts and hidden machines first (most recently edited first), then the site order. */
  @IsOptional()
  @IsIn(['site', 'pending'])
  order?: 'site' | 'pending';
}

export class SlugQuery {
  @IsString()
  @MaxLength(64)
  slug: string;

  @IsOptional()
  @IsString()
  excludeId?: string;
}

export class ParamDto {
  @IsString()
  @MaxLength(64)
  @Matches(PARAM_KEY_PATTERN, { message: '参数键只能以小写字母开头，包含小写字母、数字和下划线' })
  key: string;

  @IsString()
  @MinLength(1, { message: '中文参数名不能为空' })
  @MaxLength(100)
  labelZh: string;

  @IsString()
  @MinLength(1, { message: '英文参数名不能为空' })
  @MaxLength(100)
  labelEn: string;

  @IsString()
  @MinLength(1, { message: '中文参数值不能为空' })
  @MaxLength(500)
  valueZh: string;

  @IsString()
  @MaxLength(500)
  valueEn: string;
}

export class ImageRefDto {
  @IsString()
  mediaId: string;

  @IsBoolean()
  isCover: boolean;
}

export class MachineInputDto {
  @IsString()
  @MaxLength(64)
  @Matches(SLUG_PATTERN, { message: 'slug 只能包含小写字母、数字和单个短横线' })
  slug: string;

  @IsString()
  @MinLength(1, { message: '型号不能为空' })
  @MaxLength(64)
  model: string;

  @IsString()
  categoryId: string;

  @IsString()
  @MinLength(1, { message: '中文名称不能为空' })
  @MaxLength(200)
  nameZh: string;

  @IsString()
  @MinLength(1, { message: '英文名称不能为空' })
  @MaxLength(200)
  nameEn: string;

  @IsOptional() @IsString() @MaxLength(5000) summaryZh?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) summaryEn?: string | null;

  @IsEnum(MachineStatus)
  status: MachineStatus;

  @IsBoolean()
  featured: boolean;

  @IsOptional() @IsString() @MaxLength(200) seoTitleZh?: string | null;
  @IsOptional() @IsString() @MaxLength(200) seoTitleEn?: string | null;
  @IsOptional() @IsString() @MaxLength(500) seoDescZh?: string | null;
  @IsOptional() @IsString() @MaxLength(500) seoDescEn?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(64) videoId?: string | null;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ParamDto)
  params: ParamDto[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ImageRefDto)
  images: ImageRefDto[];
}

export const BATCH_ACTIONS = ['publish', 'hide', 'draft', 'feature', 'unfeature', 'delete'] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];

export class BatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  ids: string[];

  @IsIn(BATCH_ACTIONS)
  action: BatchAction;
}

export class MachineOrderDto {
  @IsString()
  categoryId: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids: string[];
}
