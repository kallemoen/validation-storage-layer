import type { VercelResponse } from '@vercel/node';
import type { ApiResponse } from '../types/api.js';

export function success<T>(res: VercelResponse, data: T, status = 200): void {
  res.status(status).json({ success: true, data } satisfies ApiResponse<T>);
}

export function error(
  res: VercelResponse,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  } satisfies ApiResponse);
}
