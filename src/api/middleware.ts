import type { Request, Response, NextFunction } from 'express';

// Tenant extraction from header or query param
export function extractTenant(req: Request, res: Response, next: NextFunction): void {
  const tenantId =
    (req.headers['x-tenant-id'] as string) ||
    (req.query.tenant as string);

  if (!tenantId) {
    res.status(400).json({ error: 'x-tenant-id header or ?tenant= query param is required' });
    return;
  }

  (req as Request & { tenantId: string }).tenantId = tenantId;
  next();
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxPerMinute: number = 10) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantId = (req as Request & { tenantId: string }).tenantId || 'anonymous';
    const now = Date.now();
    const entry = rateLimitMap.get(tenantId);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(tenantId, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }

    if (entry.count >= maxPerMinute) {
      res.status(429).json({ error: 'Rate limit exceeded. Max 10 requests per minute.' });
      return;
    }

    entry.count++;
    next();
  };
}

// Request ID generation
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { requestId: string }).requestId = crypto.randomUUID();
  next();
}
