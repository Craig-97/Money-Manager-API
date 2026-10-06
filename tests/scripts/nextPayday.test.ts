import { DEFAULT_PAYDAY, fromIsoDay, nextPayday } from '../../scripts/migrations/nextPayday';

const NONE = new Set<string>();

describe('nextPayday', () => {
  it('finds the last day of the month', () => {
    expect(nextPayday(DEFAULT_PAYDAY, NONE, fromIsoDay('2030-01-10'))).toBe('2030-01-31');
  });

  it('moves a weekend payday to the working day before', () => {
    // 31 August 2030 is a Saturday
    expect(nextPayday(DEFAULT_PAYDAY, NONE, fromIsoDay('2030-08-10'))).toBe('2030-08-30');
  });

  it('moves a bank holiday payday to the working day before', () => {
    const rule = { frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 25 } as const;
    expect(nextPayday(rule, new Set(['2030-12-25']), fromIsoDay('2030-12-01'))).toBe('2030-12-24');
  });

  it('gives the following payday when today is payday', () => {
    expect(nextPayday(DEFAULT_PAYDAY, NONE, fromIsoDay('2030-01-31'))).toBe('2030-02-28');
  });

  it('counts weekly pay on a set weekday from the first pay date', () => {
    const rule = {
      frequency: 'FORTNIGHTLY',
      type: 'SET_WEEKDAY',
      weekday: 'FRIDAY',
      firstPayDate: '2030-01-04'
    } as const;
    expect(nextPayday(rule, NONE, fromIsoDay('2030-01-09'))).toBe('2030-01-18');
  });

  it('uses a payday the user moved', () => {
    const rule = { ...DEFAULT_PAYDAY, overrides: [{ for: '2030-01-31', date: '2030-01-29' }] };
    expect(nextPayday(rule, NONE, fromIsoDay('2030-01-10'))).toBe('2030-01-29');
  });
});
