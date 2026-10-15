import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Per-request values that deep services need without threading them through every call (e.g. audit IP). */
export const requestContext = new AsyncLocalStorage<{ ip?: string }>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  requestContext.run({ ip: req.ip }, next);
}
