import { nextOccurrence, occurrence, occurrencesBefore, ukDay } from '../../utils/dates';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe('occurrence', () => {
  it('steps week-based payments by days', () => {
    expect(iso(occurrence(day('2030-01-03'), 'WEEKLY', 2))).toBe('2030-01-17');
    expect(iso(occurrence(day('2030-01-03'), 'BIWEEKLY', 2))).toBe('2030-01-31');
  });

  it('keeps the first payment day, moving to the end of shorter months', () => {
    const first = day('2030-01-31');
    expect(iso(occurrence(first, 'MONTHLY', 1))).toBe('2030-02-28');
    expect(iso(occurrence(first, 'MONTHLY', 2))).toBe('2030-03-31');
    expect(iso(occurrence(first, 'QUARTERLY', 1))).toBe('2030-04-30');
    expect(iso(occurrence(day('2028-02-29'), 'ANNUALLY', 1))).toBe('2029-02-28');
  });
});

describe('nextOccurrence', () => {
  const schedule = { firstPaymentDate: day('2030-01-15'), frequency: 'MONTHLY' as const };

  it('returns the first payment when it is still to come', () => {
    expect(iso(nextOccurrence(schedule, day('2030-01-01')))).toBe('2030-01-15');
  });

  it('counts a payment due on the day as next', () => {
    expect(iso(nextOccurrence(schedule, day('2030-03-15')))).toBe('2030-03-15');
    expect(iso(nextOccurrence(schedule, day('2030-03-16')))).toBe('2030-04-15');
  });

  it('returns null once the last payment has passed', () => {
    const ending = { ...schedule, lastPaymentDate: day('2030-02-15') };
    expect(iso(nextOccurrence(ending, day('2030-02-15')))).toBe('2030-02-15');
    expect(nextOccurrence(ending, day('2030-02-16'))).toBeNull();
  });
});

describe('occurrencesBefore', () => {
  const weekly = { firstPaymentDate: day('2030-01-07'), frequency: 'WEEKLY' as const };

  it('lists the dates from the first on or after `from` up to, not including, `until`', () => {
    expect(occurrencesBefore(weekly, day('2030-01-08'), day('2030-02-04')).map(iso)).toEqual([
      '2030-01-14',
      '2030-01-21',
      '2030-01-28'
    ]);
  });

  it('stops at the last payment', () => {
    const ending = { ...weekly, lastPaymentDate: day('2030-01-14') };
    expect(occurrencesBefore(ending, day('2030-01-01'), day('2030-02-04')).map(iso)).toEqual([
      '2030-01-07',
      '2030-01-14'
    ]);
  });
});

describe('ukDay', () => {
  it('uses the UK date, which is ahead of UTC in summer', () => {
    expect(iso(ukDay(new Date('2030-06-30T23:30:00Z')))).toBe('2030-07-01');
    expect(iso(ukDay(new Date('2030-12-31T23:30:00Z')))).toBe('2030-12-31');
  });
});
