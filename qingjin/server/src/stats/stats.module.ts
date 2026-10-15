import { Module } from '@nestjs/common';
import { PublishModule } from '../publish/publish.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [PublishModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
