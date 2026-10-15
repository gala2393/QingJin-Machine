import { Module } from '@nestjs/common';
import { PublishService } from './publish.service';
import { ReleasesController } from './releases.controller';

@Module({
  controllers: [ReleasesController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
