import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PARAM_KEY_PATTERN, SLUG_PATTERN } from '../common/patterns';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(64)
  @Matches(SLUG_PATTERN, { message: 'slug 只能包含小写字母、数字和单个短横线' })
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nameZh: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nameEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  icon?: string | null;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(SLUG_PATTERN, { message: 'slug 只能包含小写字母、数字和单个短横线' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nameZh?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  icon?: string | null;
}

export class OrderDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids: string[];
}

export class TemplateItemDto {
  @IsString()
  @MaxLength(64)
  @Matches(PARAM_KEY_PATTERN, { message: '参数键只能以小写字母开头，包含小写字母、数字和下划线' })
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelZh: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  labelEn: string;
}

export class PutTemplatesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items: TemplateItemDto[];
}
