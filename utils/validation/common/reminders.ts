import { z } from 'zod';

const daysText = (choices: readonly number[]) =>
  `${choices.slice(0, -1).join(', ')} or ${choices.at(-1)} days`;

/*
 * When a reminder goes off: off, one of the choices of days before, or the usual timing (no days).
 * A reminder that's off has no days.
 */
export const reminderTiming = (choices: readonly number[]) =>
  z
    .object({
      off: z.boolean(),
      days: z
        .number()
        .refine(days => choices.includes(days), `Reminders must be ${daysText(choices)} before`)
        .nullish()
    })
    .refine(timing => !(timing.off && timing.days != null), {
      message: "A reminder that's off can't have days",
      path: ['days']
    });

// Days before a date, from the choices, each once
export const reminderDaysList = (choices: readonly number[]) =>
  z
    .array(z.number().refine(days => choices.includes(days), `Reminders must be ${daysText(choices)} before`))
    .max(choices.length)
    .refine(list => new Set(list).size === list.length, 'Each reminder can only be chosen once');
