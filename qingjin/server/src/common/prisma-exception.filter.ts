import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/** Turns database constraint errors into client errors instead of 500s. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, '数据重复，可能已存在相同的标识'],
      P2003: [HttpStatus.BAD_REQUEST, '引用的数据不存在或仍被使用'],
      P2025: [HttpStatus.NOT_FOUND, '数据不存在'],
    };
    const hit = map[err.code];
    if (!hit) {
      this.logger.error(`${err.code}: ${err.message}`);
      res.status(500).json({ statusCode: 500, message: '服务器错误', error: 'Internal Server Error' });
      return;
    }
    const [status, message] = hit;
    res.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }
}
