import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1, { message: '请输入用户名' })
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: '请输入当前密码' })
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: '新密码至少 10 位' })
  @MaxLength(100)
  newPassword: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  refreshToken: string;
}
