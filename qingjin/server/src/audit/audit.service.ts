import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requestContext } from '../common/request-context';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { ...entry, ip: entry.ip ?? requestContext.getStore()?.ip ?? null } });
    } catch (err) {
      // Audit failures must never break the user's request.
      this.logger.error(`failed to write audit log: ${(err as Error).message}`);
    }
  }
}
