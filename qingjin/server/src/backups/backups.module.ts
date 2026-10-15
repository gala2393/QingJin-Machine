import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [AuditModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
