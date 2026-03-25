import type { VercelResponse } from '@vercel/node';
import { error } from '../lib/response.js';

export function handleError(res: VercelResponse, err: unknown): void {
  console.error('Unhandled error:', err);

  if (err instanceof Error) {
    error(res, 'INTERNAL_ERROR', err.message, 500);
  } else {
    error(res, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
}
