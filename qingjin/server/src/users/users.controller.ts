import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Roles('SUPER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() me: AuthUser) {
    return this.users.create(dto, me.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    return this.users.update(id, dto, me.id);
  }

  @Post(':id/password')
  @HttpCode(204)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() me: AuthUser) {
    await this.users.resetPassword(id, dto.password, me.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    await this.users.remove(id, me.id);
  }
}
