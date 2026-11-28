// The working days a payday can fall on
export const Weekday = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY'
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];
