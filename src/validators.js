import { z } from 'zod';

export const ImageRequestSchema = z.object({
  image_base64: z.string().optional(),
  debug: z.union([z.boolean(), z.string()]).optional(),
  models: z.array(z.string()).optional()
});
