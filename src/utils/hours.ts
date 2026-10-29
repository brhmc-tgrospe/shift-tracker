import { ShiftType, SHIFTS } from '../types';
import { getPhilippineHolidaysForMonthSync, PhilippineHoliday } from './philippineHolidays';

/**
 * Checks whether a given YYYY-MM-DD date is an official Philippine holiday.
 */
export function isDatePhilippineHoliday(
  dateStr: string,
  holidaysMap?: Map<string, PhilippineHoliday>
): boolean {
  if (holidaysMap) {
    return holidaysMap.has(dateStr);
  }
  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const map = getPhilippineHolidaysForMonthSync(year, month);
  return map.has(dateStr);
}

export interface HolidayOverrides {
  added: string[];
  removed: string[];
}

/**
 * Retrieves client-side holiday overrides for a specific year and month (0-indexed).
 */
export function getHolidayOverrides(year: number, month: number): HolidayOverrides {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { added: [], removed: [] };
  }
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  try {
    const raw = window.localStorage.getItem(`holiday-overrides-${monthKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        added: Array.isArray(parsed.added) ? parsed.added : [],
        removed: Array.isArray(parsed.removed) ? parsed.removed : []
      };
    }
  } catch {
    // Ignore JSON parse errors and return empty
  }
  return { added: [], removed: [] };
}

/**
 * Persists client-side holiday overrides for a specific year and month (0-indexed).
 */
export function saveHolidayOverrides(year: number, month: number, overrides: HolidayOverrides): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  try {
    window.localStorage.setItem(`holiday-overrides-${monthKey}`, JSON.stringify(overrides));
  } catch (err) {
    console.error('Failed to save holiday overrides:', err);
  }
}

/**
 * Returns a set of all YYYY-MM-DD dates in a month that are treated as holidays.
 * Combines:
 * 1. Official Philippine national holidays (via public calendar feed / algorithm)
 * 2. Explicit 'holiday' shifts plotted in the schedule
 * 3. Client-side local overrides (added / removed dates)
 */
export function getMonthlyHolidayDates(
  year: number,
  month: number, // 0-indexed
  shifts?: Record<string, any>
): Set<string> {
  const holidayDates = new Set<string>();

  // 1. Official Philippine holidays
  const phHolidays = getPhilippineHolidaysForMonthSync(year, month);
  for (const date of phHolidays.keys()) {
    holidayDates.add(date);
  }

  // 2. Explicit shift tagging
  if (shifts) {
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    for (const key of Object.keys(shifts)) {
      const shiftData = shifts[key];
      if (shiftData && shiftData.shift === 'holiday' && shiftData.date && shiftData.date.startsWith(monthPrefix)) {
        holidayDates.add(shiftData.date);
      }
    }
  }

  // 3. User overrides
  const overrides = getHolidayOverrides(year, month);
  for (const addedDate of overrides.added) {
    holidayDates.add(addedDate);
  }
  for (const removedDate of overrides.removed) {
    holidayDates.delete(removedDate);
  }

  return holidayDates;
}

/**
 * Toggles a date's holiday status in the monthly holiday overrides.
 * Returns the new holiday status (true if now a holiday, false otherwise).
 */
export function toggleHolidayDate(
  year: number,
  month: number,
  dateStr: string,
  shifts?: Record<string, any>
): boolean {
  const currentDates = getMonthlyHolidayDates(year, month, shifts);
  const isCurrentlyHoliday = currentDates.has(dateStr);
  const overrides = getHolidayOverrides(year, month);

  const addedSet = new Set(overrides.added);
  const removedSet = new Set(overrides.removed);

  if (isCurrentlyHoliday) {
    addedSet.delete(dateStr);
    removedSet.add(dateStr);
  } else {
    removedSet.delete(dateStr);
    addedSet.add(dateStr);
  }

  saveHolidayOverrides(year, month, {
    added: Array.from(addedSet),
    removed: Array.from(removedSet)
  });

  return !isCurrentlyHoliday;
}

/**
 * Checks if a specific YYYY-MM-DD date is treated as a holiday in the monthly schedule.
 */
export function isDateHoliday(dateStr: string, shifts?: Record<string, any>): boolean {
  if (!dateStr) return false;
  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  return getMonthlyHolidayDates(year, month, shifts).has(dateStr);
}

/**
 * Helper to check if a YYYY-MM-DD date falls on a weekend (Saturday or Sunday).
 */
export function isWeekendDay(dateStr: string): boolean {
  if (!dateStr) return false;
  const safeDate = new Date(`${dateStr.split('T')[0]}T12:00:00`);
  const day = safeDate.getDay();
  return day === 0 || day === 6;
}

/**
 * Calculates the rendered hours for a given shift on a specific date.
 * Pursuant to DOH / BRHMC Memorandum No. 2026-094 & Weekend Holiday Rules:
 * - When a holiday falls on a WEEKEND (Saturday or Sunday):
 *   - 12h shifts ('12h-m' or '12h-e') receive 20 hours (12h worked + 8h holiday premium).
 *   - Off-duty / non-working staff ('off', 'free', 'holiday', etc.) receive NO additional 8h credit (0 hours).
 * - When a holiday falls on a WEEKDAY (Monday to Friday):
 *   - 12h shifts receive 20 hours (12h worked + 8h holiday credit).
 *   - 8h shifts receive 16 hours (8h worked + 8h holiday credit).
 *   - Off-duty / non-working staff receive 8 hours statutory holiday credit.
 * - Regular non-holiday days follow standard shift hours.
 */
export function calculateRenderedHours(
  shift: ShiftType | string | undefined | null,
  dateStrOrIsHoliday: string | boolean,
  isHolidayParam?: boolean,
  explicitHours?: number
): number {
  let dateStr: string | undefined;
  let isHoliday = false;

  if (typeof dateStrOrIsHoliday === 'string') {
    dateStr = dateStrOrIsHoliday;
    isHoliday = !!isHolidayParam;
  } else {
    isHoliday = !!dateStrOrIsHoliday;
    if (typeof isHolidayParam === 'number') {
      explicitHours = isHolidayParam;
    }
  }

  const isWeekend = dateStr ? isWeekendDay(dateStr) : false;

  if (isHoliday) {
    // 12-hour duty on any holiday (weekend or weekday) always receives 20 hours
    if (shift === '12h-m' || shift === '12h-e') {
      return 20; // 12h worked + 8h premium
    }
    // 8-hour duty on holiday
    if (shift === '8h') {
      return 16; // 8h worked + 8h premium
    }

    // Non-working shifts on a Weekend Holiday: strictly NO additional 8 hours
    if (isWeekend) {
      if (typeof explicitHours === 'number' && explicitHours > 0) {
        return explicitHours;
      }
      return 0;
    }

    // Non-working shifts on a Weekday Holiday: receive 8 hours statutory credit
    return 8;
  }

  // Non-holiday dates
  if (shift === '12h-m' || shift === '12h-e') {
    return 12;
  }
  if (shift === '8h' || shift === 'on-leave') {
    return 8;
  }
  if (shift === 'holiday') {
    return 8;
  }

  // Explicit hours override if provided
  if (typeof explicitHours === 'number' && explicitHours > 0) {
    return explicitHours;
  }

  // Fallback to shift definition default if available
  if (shift && SHIFTS[shift as ShiftType]) {
    return SHIFTS[shift as ShiftType].defaultHours;
  }

  return 0;
}
