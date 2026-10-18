import { writeCalendar } from '../../utils/calendar/ics';

const NOW = new Date('2030-01-02T09:30:00.000Z');

const write = (event: Partial<Parameters<typeof writeCalendar>[0]['events'][number]> = {}) =>
  writeCalendar({
    name: 'Money Manager',
    now: NOW,
    events: [{ uid: 'one@money-manager', date: '2030-01-31', title: 'Payday', alarms: [], ...event }]
  });

describe('writeCalendar', () => {
  it('writes an all-day event that ends the next day, with CRLF line endings', () => {
    const lines = write().split('\r\n');

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('X-WR-CALNAME:Money Manager');
    expect(lines).toContain('UID:one@money-manager');
    expect(lines).toContain('DTSTAMP:20300102T093000Z');
    expect(lines).toContain('DTSTART;VALUE=DATE:20300131');
    expect(lines).toContain('DTEND;VALUE=DATE:20300201');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(lines.at(-1)).toBe('');
  });

  it('sounds alarms at 8:00, on the day or days before', () => {
    const text = write({ alarms: [0, 1, 7, 7] });

    expect(text).toContain('TRIGGER:PT8H');
    expect(text).toContain('TRIGGER:-PT16H');
    expect(text).toContain('TRIGGER:-PT160H');
    // The same day twice is one alarm
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(3);
  });

  it('escapes the characters that mean something in the format', () => {
    const text = write({ title: 'Tax; NI, etc', description: 'Line one\nC:\\path' });

    expect(text).toContain('SUMMARY:Tax\\; NI\\, etc');
    expect(text).toContain('DESCRIPTION:Line one\\nC:\\\\path');
  });

  it('folds long lines, counting bytes, so no line is longer than 75', () => {
    const text = write({ description: '£'.repeat(100) });

    for (const line of text.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(text.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${'£'.repeat(100)}`);
  });
});
