import type { VercelResponse } from '@vercel/node';
import type { ApiResponse } from '../types/api.js';
import { getActiveNotices } from './notices.js';

export function success<T>(res: VercelResponse, data: T, status = 200): void {
  const notices = getActiveNotices();
  res.status(status).json({
    success: true,
    data,
    ...(notices.length > 0 && { notices }),
  } satisfies ApiResponse<T>);
}

export function error(
  res: VercelResponse,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): void {
  const notices = getActiveNotices();
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
    ...(notices.length > 0 && { notices }),
  } satisfies ApiResponse);
}
