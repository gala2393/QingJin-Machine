import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import { CreateCategoryDto, OrderDto, PutTemplatesDto, UpdateCategoryDto } from './categories.dto';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Editor()
  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(dto, user.id);
  }

  // Declared before ':id' routes so "order" isn't captured as an id.
  @Editor()
  @Put('order')
  @HttpCode(204)
  async reorder(@Body() dto: OrderDto, @CurrentUser() user: AuthUser) {
    await this.categories.reorder(dto.ids, user.id);
  }

  @Editor()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.update(id, dto, user.id);
  }

  @Editor()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.categories.remove(id, user.id);
  }

  @Get(':id/templates')
  templates(@Param('id') id: string) {
    return this.categories.templates(id);
  }

  @Editor()
  @Put(':id/templates')
  putTemplates(@Param('id') id: string, @Body() dto: PutTemplatesDto, @CurrentUser() user: AuthUser) {
    return this.categories.putTemplates(id, dto, user.id);
  }
}
