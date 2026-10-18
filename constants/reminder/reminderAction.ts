// What the user did with a reminder
export const ReminderAction = {
  // Seen, so it no longer counts towards the bell's number
  READ: 'READ',
  // Put away for good
  CLEAR: 'CLEAR',
  // Put away until a day, when it goes off again
  LATER: 'LATER',
  // Back as it was before it was cleared or put away, e.g. to undo either
  RESTORE: 'RESTORE'
} as const;

export type ReminderAction = (typeof ReminderAction)[keyof typeof ReminderAction];
