import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AppRole } from '../types/api.js';
import { error } from '../lib/response.js';
import * as jose from 'jose';

export interface AuthenticatedHandler {
  (req: VercelRequest & { appRole: AppRole }, res: VercelResponse): Promise<void>;
}

export function withAuth(allowedRoles: AppRole[], handler: AuthenticatedHandler) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      error(res, 'UNAUTHORIZED', 'Missing or invalid Authorization header', 401);
      return;
    }

    const token = authHeader.slice(7);
    const role = await extractRole(token);

    if (!role) {
      error(res, 'UNAUTHORIZED', 'Invalid or expired token', 401);
      return;
    }

    if (!allowedRoles.includes(role)) {
      error(res, 'FORBIDDEN', `Role '${role}' is not permitted for this endpoint`, 403);
      return;
    }

    (req as VercelRequest & { appRole: AppRole }).appRole = role;
    await handler(req as VercelRequest & { appRole: AppRole }, res);
  };
}

async function extractRole(token: string): Promise<AppRole | null> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('SUPABASE_JWT_SECRET is not set');
    return null;
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    const role = (payload as Record<string, unknown>).app_role;
    if (typeof role === 'string' && isValidRole(role)) {
      return role;
    }
    return null;
  } catch {
    return null;
  }
}

function isValidRole(role: string): role is AppRole {
  return ['development', 'collection', 'admin'].includes(role);
}
