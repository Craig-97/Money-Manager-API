import {
  accrue,
  debtAccruedTo,
  debtDailyInterest,
  payDebtOn,
  savingsAccruedTo,
  savingsDailyInterest
} from '../../utils/interest';
import { daysBetween } from '../../utils/dates';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('interest worked out each day', () => {
  it('counts whole UK days', () => {
    expect(daysBetween(day('2026-10-01'), day('2026-11-01'))).toBe(31);
    // The clocks going back don't make it a day longer
    expect(daysBetween(day('2026-10-24'), day('2026-10-26'))).toBe(2);
  });

  it('spreads savings AER so a year of days earns it, and a debt’s APR evenly', () => {
    // Twelve monthly payments, each earning on the last, make the AER
    const monthly = (savingsDailyInterest(1, { rate: 4.5, frequency: 'MONTHLY' }) * 365) / 12;
    expect((1 + monthly) ** 12).toBeCloseTo(1.045, 10);
    expect(savingsDailyInterest(1, { rate: 5, frequency: 'MATURITY' }) * 365).toBeCloseTo(0.05, 10);
    expect(debtDailyInterest(3650, 10)).toBeCloseTo(1, 10);
    // Nothing on a balance below nothing
    expect(savingsDailyInterest(-50, { rate: 4.5, frequency: 'MONTHLY' })).toBe(0);
  });

  it('adds days at a balance, and leaves what’s counted alone for a day already passed', () => {
    const from = { accrued: 2.5, accruedTo: day('2026-10-01') };
    expect(accrue(from, { daily: 1, to: day('2026-10-11') })).toEqual({
      accrued: 12.5,
      accruedTo: day('2026-10-11')
    });
    expect(accrue(from, { daily: 1, to: day('2026-09-01') })).toEqual(from);
  });

  it('counts savings from the last payment until something’s been counted', () => {
    const interest = { rate: 4.5, frequency: 'MONTHLY' as const, day: 31, nextDate: day('2026-11-30') };
    expect(savingsAccruedTo({ balance: 100, balanceUpdatedAt: day('2026-11-02'), interest })).toEqual(
      day('2026-10-31')
    );
    // A fixed term pays once, so it counts from when the balance was set
    expect(
      savingsAccruedTo({
        balance: 100,
        balanceUpdatedAt: new Date('2026-06-02T15:00:00Z'),
        interest: { rate: 5, frequency: 'MATURITY' as const, day: 2, nextDate: day('2027-06-02') }
      })
    ).toEqual(day('2026-06-02'));
  });

  it('counts a debt from its last payment, or a balance set since', () => {
    const payment = {
      amount: 100,
      frequency: 'MONTHLY' as const,
      firstPaymentDate: day('2026-01-15'),
      nextDueDate: day('2026-11-15')
    };
    expect(debtAccruedTo({ ...payment, debt: { balance: 1000, apr: 12, balanceUpdatedAt: day('2026-01-01') } })).toEqual(
      day('2026-10-15')
    );
    expect(debtAccruedTo({ ...payment, debt: { balance: 1000, apr: 12, balanceUpdatedAt: day('2026-10-20') } })).toEqual(
      day('2026-10-20')
    );
  });

  it('pays several missed dates in order, each with the interest up to it', () => {
    const debt = { balance: 3650, apr: 10, accrued: 0, accruedTo: day('2026-09-01') };
    const payment = { amount: 100, frequency: 'MONTHLY' as const, firstPaymentDate: day('2026-01-01'), debt };

    // 30 days at £1, then 31 days at a little less
    expect(payDebtOn(payment, [day('2026-10-01'), day('2026-11-01')])).toEqual({
      interest: 60.41,
      reduction: 139.59,
      balanceAfter: 3510.41,
      // What had built up before, for undo
      accruedBefore: 0,
      accruedToBefore: day('2026-09-01')
    });
    expect(debt).toMatchObject({ accrued: 0, accruedTo: day('2026-11-01') });
  });
});
