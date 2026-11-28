import { z } from 'zod';

const isHttps = (value: string) => URL.canParse(value) && new URL(value).protocol === 'https:';

// A logo shown in place of the letter, as a link to an image. Blank means none.
export const iconUrl = z
  .string()
  .trim()
  .max(2048, 'Logo links must be 2,048 characters or fewer')
  .refine(value => !value || isHttps(value), 'Logo links must start with https://')
  .transform(value => value || null)
  .nullish();
