import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';

// Written by deploy/backup.sh; keep the names in sync.
const FILE_RE = /^(db|uploads)-\d{8}-\d{6}\.(sql|tar)\.gz$/;
const REQUEST_FLAG = '.request';
const RUNNING_FLAG = '.running';
const LOG_FILE = 'backup.log';

export interface BackupFile {
  name: string;
  type: 'database' | 'uploads';
  size: number;
  createdAt: string;
}

@Injectable()
export class BackupsService {
  private readonly dir = process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : null;
  private readonly schedule = process.env.BACKUP_SCHEDULE || `每天 ${process.env.BACKUP_AT || '03:30'}`;
  private readonly keep = Number(process.env.BACKUP_KEEP) || 14;

  constructor(private readonly audit: AuditService) {}

  async status() {
    const base = { enabled: false, schedule: this.schedule, keep: this.keep, requestPending: false, files: [] as BackupFile[], log: '' };
    if (!this.dir) return base;
    const names = await readdir(this.dir).catch(() => null);
    if (!names) return base;
    const files: BackupFile[] = [];
    for (const name of names) {
      if (!FILE_RE.test(name)) continue;
      const st = await stat(join(this.dir, name)).catch(() => null);
      if (!st?.isFile()) continue;
      files.push({ name, type: name.startsWith('db-') ? 'database' : 'uploads', size: st.size, createdAt: st.mtime.toISOString() });
    }
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const log = await readFile(join(this.dir, LOG_FILE), 'utf8').catch(() => '');
    return {
      ...base,
      enabled: true,
      requestPending: names.includes(REQUEST_FLAG) || names.includes(RUNNING_FLAG),
      files,
      log: log.split('\n').filter(Boolean).slice(-50).join('\n'),
    };
  }

  async requestRun(userId: string) {
    const s = await this.status();
    if (!s.enabled || !this.dir) throw new NotFoundException('当前环境未启用备份');
    if (s.requestPending) throw new ConflictException('已有备份在等待或进行中');
    await writeFile(join(this.dir, REQUEST_FLAG), new Date().toISOString());
    await this.audit.log({ userId, action: 'backup', entity: 'backup' });
    return { requestPending: true };
  }

  async open(name: string, userId: string) {
    if (!this.dir || !FILE_RE.test(name)) throw new NotFoundException('备份文件不存在');
    const path = join(this.dir, name);
    const st = await stat(path).catch(() => null);
    if (!st?.isFile()) throw new NotFoundException('备份文件不存在');
    await this.audit.log({ userId, action: 'download', entity: 'backup', entityId: name });
    return { stream: createReadStream(path), size: st.size };
  }
}
