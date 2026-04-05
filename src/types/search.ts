import { z } from 'zod';

export const ExecuteQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

export type ExecuteQueryInput = z.infer<typeof ExecuteQuerySchema>;
