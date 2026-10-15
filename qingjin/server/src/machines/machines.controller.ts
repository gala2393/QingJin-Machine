import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Editor } from '../auth/decorators';
import { BatchDto, ListMachinesQuery, MachineInputDto, MachineOrderDto, SlugQuery } from './machines.dto';
import { MachinesService } from './machines.service';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  list(@Query() query: ListMachinesQuery) {
    return this.machines.list(query);
  }

  // Fixed paths are declared before ':id' so they aren't captured as ids.
  @Get('slug-available')
  slugAvailable(@Query() q: SlugQuery) {
    return this.machines.slugAvailable(q.slug, q.excludeId);
  }

  @Editor()
  @Post('batch')
  @HttpCode(200)
  batch(@Body() dto: BatchDto, @CurrentUser() user: AuthUser) {
    return this.machines.batch(dto.ids, dto.action, user.id);
  }

  @Editor()
  @Put('order')
  @HttpCode(204)
  async reorder(@Body() dto: MachineOrderDto, @CurrentUser() user: AuthUser) {
    await this.machines.reorder(dto.categoryId, dto.ids, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.machines.get(id);
  }

  @Editor()
  @Post()
  create(@Body() dto: MachineInputDto, @CurrentUser() user: AuthUser) {
    return this.machines.create(dto, user.id);
  }

  @Editor()
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: MachineInputDto, @CurrentUser() user: AuthUser) {
    return this.machines.update(id, dto, user.id);
  }

  @Editor()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.machines.remove(id, user.id);
  }

  @Editor()
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.machines.duplicate(id, user.id);
  }
}
