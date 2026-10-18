/*
 * Writes an iCalendar (.ics) file of all-day events, the format calendar apps subscribe to. Each
 * event can carry alarms, which the calendar app sounds at 8:00 on the day.
 */

export interface CalendarEvent {
  // Stays the same from one fetch to the next, so the calendar updates an event rather than adding
  // another
  uid: string;
  // 'YYYY-MM-DD'
  date: string;
  title: string;
  description?: string;
  // Days before the date to alarm, at 8:00
  alarms: number[];
}

// The hour of the day an alarm goes off
const ALARM_HOUR = 8;

// Lines longer than this many bytes are folded onto the next line, as the format asks
const LINE_BYTES = 75;

const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const fold = (line: string) => {
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    // Continuation lines start with a space, which counts towards their length
    const limit = parts.length ? LINE_BYTES - 1 : LINE_BYTES;
    if (Buffer.byteLength(current + char) > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
};

const compactDay = (date: string) => date.replace(/-/g, '');

const nextDay = (date: string) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

// 8:00 on the day, counted back from the start of an all-day event: -PT16H is 8:00 the day before
const trigger = (daysBefore: number) => {
  const hours = daysBefore * 24 - ALARM_HOUR;
  return hours <= 0 ? `PT${-hours}H` : `-PT${hours}H`;
};

const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const eventLines = (event: CalendarEvent, now: Date) => [
  'BEGIN:VEVENT',
  `UID:${event.uid}`,
  `DTSTAMP:${stamp(now)}`,
  `DTSTART;VALUE=DATE:${compactDay(event.date)}`,
  `DTEND;VALUE=DATE:${compactDay(nextDay(event.date))}`,
  `SUMMARY:${escapeText(event.title)}`,
  ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
  // Shows as free, so it doesn't block time
  'TRANSP:TRANSPARENT',
  ...[...new Set(event.alarms)].flatMap(days => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.title)}`,
    `TRIGGER:${trigger(days)}`,
    'END:VALARM'
  ]),
  'END:VEVENT'
];

/* The whole calendar, ready to send */
export const writeCalendar = ({ name, events, now = new Date() }: { name: string; events: CalendarEvent[]; now?: Date }) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Money Manager//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    // How often calendar apps that read these should check for changes
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events.flatMap(event => eventLines(event, now)),
    'END:VCALENDAR'
  ]
    .map(fold)
    .join('\r\n') + '\r\n';
