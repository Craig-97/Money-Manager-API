// The rule that picks the payday in each period
export const PaydayType = {
  LAST_DAY: 'LAST_DAY',
  LAST_WEEKDAY: 'LAST_WEEKDAY',
  SET_DAY: 'SET_DAY',
  SET_WEEKDAY: 'SET_WEEKDAY'
} as const;

export type PaydayType = (typeof PaydayType)[keyof typeof PaydayType];
