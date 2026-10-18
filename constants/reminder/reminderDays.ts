// The choices for how many days before something its reminder goes off

// A payment: on the day, the day before, 3 days or a week before
export const PAYMENT_REMINDER_DAYS = [0, 1, 3, 7] as const;

// A renewal: a week, two weeks or a month before
export const RENEWAL_REMINDER_DAYS = [7, 14, 30] as const;

// A note's date: on the day, the day before, a week, two weeks or a month before
export const NOTE_REMINDER_DAYS = [0, 1, 7, 14, 30] as const;
