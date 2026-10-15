import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const ROLES = ['SUPER_ADMIN', 'EDITOR', 'VIEWER'] as const;

export class CreateUserDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, { message: '用户名为 3–32 位字母、数字或 _ . -' })
  username: string;

  @IsString()
  @MinLength(1, { message: '请输入显示名' })
  @MaxLength(50)
  displayName: string;

  @IsIn(ROLES, { message: '角色不正确' })
  role: (typeof ROLES)[number];

  @IsString()
  @MinLength(10, { message: '密码至少 10 位' })
  @MaxLength(100)
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '请输入显示名' })
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @IsIn(ROLES, { message: '角色不正确' })
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10, { message: '密码至少 10 位' })
  @MaxLength(100)
  password: string;
}
