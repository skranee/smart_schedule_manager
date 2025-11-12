import { addMinutes, differenceInMinutes, formatISO, parseISO, set } from 'date-fns';

export interface TimeWindow {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export const MINUTES_IN_DAY = 24 * 60;

export function minutesSinceMidnight(time: string): number {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr ?? '0');
  const minutes = Number(minutesStr ?? '0');
  return hours * 60 + minutes;
}

export function combineDateAndTime(date: string, time: string): Date {
  const base = parseISO(date);
  return set(base, {
    hours: Number(time.split(':')[0]),
    minutes: Number(time.split(':')[1]),
    seconds: 0,
    milliseconds: 0
  });
}

export function toIsoString(date: Date): string {
  return formatISO(date);
}

export function diffMinutes(a: Date, b: Date): number {
  return differenceInMinutes(a, b);
}

export function buildDaySlots(date: string, slotMinutes: number): { start: Date; end: Date }[] {
  const base = parseISO(date);
  const slots: { start: Date; end: Date }[] = [];
  for (let minutes = 0; minutes < MINUTES_IN_DAY; minutes += slotMinutes) {
    const start = addMinutes(base, minutes);
    const end = addMinutes(start, slotMinutes);
    slots.push({ start, end });
  }
  return slots;
}

export function isWithinWindow(moment: Date, window: TimeWindow): boolean {
  const start = parseISO(window.start);
  const end = parseISO(window.end);
  return moment >= start && moment < end;
}

export function overlapsWindow(interval: TimeWindow, window: TimeWindow): boolean {
  const intervalStart = parseISO(interval.start);
  const intervalEnd = parseISO(interval.end);
  const windowStart = parseISO(window.start);
  const windowEnd = parseISO(window.end);
  return intervalStart < windowEnd && intervalEnd > windowStart;
}

export function clampToDay(date: Date): Date {
  const midnight = set(date, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
  if (date < midnight) return midnight;
  const endOfDay = addMinutes(midnight, MINUTES_IN_DAY - 1);
  if (date > endOfDay) return endOfDay;
  return date;
}

