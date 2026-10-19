import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health.controller';
import { MachinesModule } from './machines/machines.module';
import { MediaModule } from './media/media.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublishModule } from './publish/publish.module';
import { SettingsModule } from './settings/settings.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';
import { AuditLogsModule } from './audit/audit-logs.module';
import { ExcelModule } from './excel/excel.module';
import { BackupsModule } from './backups/backups.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // In production nginx serves /uploads directly; this keeps local dev self-contained.
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.UPLOAD_DIR ?? './uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false, fallthrough: false, maxAge: '7d' },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CategoriesModule,
    MachinesModule,
    MediaModule,
    PublishModule,
    SettingsModule,
    StatsModule,
    UsersModule,
    AuditLogsModule,
    ExcelModule,
    BackupsModule,
    VideosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
