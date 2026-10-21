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

/**
 * Returns a set of all YYYY-MM-DD dates in a month that are treated as holidays.
 * A date is considered a holiday ONLY when at least one employee in the monthly schedule
 * has a shift explicitly tagged as 'holiday' on that date.
 */
export function getMonthlyHolidayDates(
  year: number,
  month: number, // 0-indexed
  shifts?: Record<string, any>
): Set<string> {
  const holidayDates = new Set<string>();

  if (shifts) {
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    for (const key of Object.keys(shifts)) {
      const shiftData = shifts[key];
      if (shiftData && shiftData.shift === 'holiday' && shiftData.date && shiftData.date.startsWith(monthPrefix)) {
        holidayDates.add(shiftData.date);
      }
    }
  }

  return holidayDates;
}

/**
 * Calculates the rendered hours for a given shift on a specific date.
 * Pursuant to DOH / BRHMC Memorandum No. 2026-094:
 * - When there is a holiday tagged in the monthly schedule, automatically add +8 hours
 *   to the number of hours rendered to the employee apart from the number of hours it is tagged on.
 * - 12-hour shifts on a holiday render 20 hours (12h + 8h holiday credit).
 * - Employees not working on that holiday receive 8 hours automatically.
 * - Standard shift hours apply on regular (non-holiday) days.
 */
export function calculateRenderedHours(
  shift: ShiftType | string | undefined | null,
  isHoliday: boolean,
  explicitHours?: number
): number {
  // If explicitly given hours that account for holiday (e.g. 20 on 12h holiday), respect if valid
  if (isHoliday) {
    if (shift === '12h-m' || shift === '12h-e') {
      return 20; // 12h worked + 8h holiday credit
    }
    if (shift === '8h') {
      return 16; // 8h worked + 8h holiday credit
    }
    // Any non-working shift on a holiday (holiday, off, free, on-leave, absent, N/A, undefined)
    return 8; // Automatically credited 8 hours for the holiday
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
