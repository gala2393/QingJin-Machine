import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function bilingual(max: number, required = false) {
  class B {
    @IsString()
    @MaxLength(max)
    @(required ? MinLength(1, { message: '不能为空' }) : () => undefined)
    zh: string;

    @IsString()
    @MaxLength(max)
    @(required ? MinLength(1, { message: '不能为空' }) : () => undefined)
    en: string;
  }
  return B;
}

const Name = bilingual(100, true);
const Short = bilingual(200);
const Address = bilingual(300);
const PhotoTitle = bilingual(100);
const PhotoDesc = bilingual(300);
const CertTitle = bilingual(200);

class ContactDto {
  @IsString() @MaxLength(100) phone: string;
  @IsString() @MaxLength(100) @ValidateIf((o: ContactDto) => o.email !== '') @IsEmail({}, { message: '邮箱格式不正确' }) email: string;
  @IsString() @MaxLength(100) whatsapp: string;
  @IsString() @MaxLength(100) wechat: string;
}

class ImageRefDto {
  @IsString() @MaxLength(64) mediaId: string;
  // Returned by GET for display; accepted and ignored on PUT so the admin can send back what it loaded.
  @IsOptional() @IsString() url?: string;
}

class FactoryPhotoDto extends ImageRefDto {
  @IsObject() @ValidateNested() @Type(() => PhotoTitle) title: InstanceType<typeof PhotoTitle>;
  @IsObject() @ValidateNested() @Type(() => PhotoDesc) desc: InstanceType<typeof PhotoDesc>;
}

class CertificateDto extends ImageRefDto {
  @IsObject() @ValidateNested() @Type(() => CertTitle) title: InstanceType<typeof CertTitle>;
  @IsString() @MaxLength(50) type: string;
}

export class SiteSettingsDto {
  @IsObject() @ValidateNested() @Type(() => Name) name: InstanceType<typeof Name>;
  @IsObject() @ValidateNested() @Type(() => Short) tagline: InstanceType<typeof Short>;
  @IsObject() @ValidateNested() @Type(() => Short) factoryPitch: InstanceType<typeof Short>;
  @IsObject() @ValidateNested() @Type(() => Short) certPitch: InstanceType<typeof Short>;
  @IsObject() @ValidateNested() @Type(() => Address) address: InstanceType<typeof Address>;
  @IsObject() @ValidateNested() @Type(() => ContactDto) contact: ContactDto;

  @IsString()
  @MaxLength(500)
  @Matches(/^(|https:\/\/\S+)$/, { message: '询盘表单地址需为空或以 https:// 开头' })
  formEndpoint: string;

  @IsOptional() @ValidateNested() @Type(() => ImageRefDto) aboutImage: ImageRefDto | null;
  @IsOptional() @ValidateNested() @Type(() => ImageRefDto) wechatQr?: ImageRefDto | null;

  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => FactoryPhotoDto) factoryPhotos: FactoryPhotoDto[];
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CertificateDto) certificates: CertificateDto[];

  // Echoed back by the admin from GET.
  @IsOptional() updatedAt?: unknown;
}
