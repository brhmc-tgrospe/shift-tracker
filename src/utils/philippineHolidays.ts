/**
 * philippineHolidays.ts
 * Fetches Philippine national holidays from public Holiday API with local algorithmic fallback & caching.
 */

export interface PhilippineHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'regular' | 'special';
}

const holidaysCache = new Map<number, PhilippineHoliday[]>();

/**
 * Calculates Easter Sunday for a given Gregorian year using Meeus/Jones/Butcher algorithm.
 */
function getEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Finds the date of the last Monday of August for a given year.
 */
function getLastMondayOfAugust(year: number): number {
  const lastDay = new Date(year, 7, 31);
  const dayOfWeek = lastDay.getDay();
  const offset = (dayOfWeek - 1 + 7) % 7;
  return 31 - offset;
}

/**
 * Local fallback calculation for Philippine holidays.
 */
export function getLocalPhilippineHolidaysForYear(year: number): PhilippineHoliday[] {
  const holidays: PhilippineHoliday[] = [];
  const format = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // Fixed Holidays
  holidays.push({ date: format(1, 1), name: "New Year's Day", type: 'regular' });
  holidays.push({ date: format(4, 9), name: 'Araw ng Kagitingan (Day of Valor)', type: 'regular' });
  holidays.push({ date: format(5, 1), name: 'Labor Day', type: 'regular' });
  holidays.push({ date: format(6, 12), name: 'Independence Day', type: 'regular' });
  holidays.push({ date: format(8, 21), name: 'Ninoy Aquino Day', type: 'special' });
  holidays.push({ date: format(11, 1), name: "All Saints' Day", type: 'special' });
  holidays.push({ date: format(11, 2), name: "All Souls' Day", type: 'special' });
  holidays.push({ date: format(11, 30), name: 'Bonifacio Day', type: 'regular' });
  holidays.push({ date: format(12, 8), name: 'Feast of the Immaculate Conception', type: 'special' });
  holidays.push({ date: format(12, 24), name: 'Christmas Eve', type: 'special' });
  holidays.push({ date: format(12, 25), name: 'Christmas Day', type: 'regular' });
  holidays.push({ date: format(12, 30), name: 'Rizal Day', type: 'regular' });
  holidays.push({ date: format(12, 31), name: 'Last Day of the Year', type: 'special' });

  // Movable Holy Week
  const easter = getEasterSunday(year);
  const easterDate = new Date(year, easter.month - 1, easter.day);

  const maundyDate = new Date(easterDate);
  maundyDate.setDate(easterDate.getDate() - 3);
  holidays.push({
    date: format(maundyDate.getMonth() + 1, maundyDate.getDate()),
    name: 'Maundy Thursday',
    type: 'regular'
  });

  const goodFridayDate = new Date(easterDate);
  goodFridayDate.setDate(easterDate.getDate() - 2);
  holidays.push({
    date: format(goodFridayDate.getMonth() + 1, goodFridayDate.getDate()),
    name: 'Good Friday',
    type: 'regular'
  });

  const blackSaturdayDate = new Date(easterDate);
  blackSaturdayDate.setDate(easterDate.getDate() - 1);
  holidays.push({
    date: format(blackSaturdayDate.getMonth() + 1, blackSaturdayDate.getDate()),
    name: 'Black Saturday',
    type: 'special'
  });

  const heroesDay = getLastMondayOfAugust(year);
  holidays.push({
    date: format(8, heroesDay),
    name: 'National Heroes Day',
    type: 'regular'
  });

  return holidays;
}

export const GCAL_PH_FEED_URL =
  'https://calendar.google.com/calendar/ical/en.philippines%23holiday%40group.v.calendar.google.com/public/basic.ics';

/**
 * Parses iCalendar (.ics) format from Google Calendar Official Philippine Holidays feed.
 * Only events with DESCRIPTION starting with 'Public holiday' are extracted, filtering out observances.
 */
export function parseGoogleCalendarIcs(icsText: string, targetYear: number): PhilippineHoliday[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT');
  const local = getLocalPhilippineHolidaysForYear(targetYear);
  const map = new Map<string, PhilippineHoliday>();

  for (const block of blocks) {
    if (!block.includes('END:VEVENT')) continue;
    const descMatch = block.match(/DESCRIPTION:([^\r\n]+)/);
    const desc = descMatch ? descMatch[1] : '';
    // Only accept official public holidays, exclude general observances
    if (!desc.startsWith('Public holiday')) continue;

    const dtMatch = block.match(/DTSTART(?:;VALUE=DATE)?:(\d{4})(\d{2})(\d{2})/);
    const sumMatch = block.match(/SUMMARY:([^\r\n]+)/);
    if (!dtMatch || !sumMatch) continue;

    const eventYear = parseInt(dtMatch[1], 10);
    if (eventYear !== targetYear) continue;

    const date = `${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}`;
    const name = sumMatch[1]
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();

    const localMatch = local.find(l => l.date === date);
    const isSpecial = localMatch
      ? localMatch.type === 'special'
      : /eve|saints|souls|immaculate|black saturday|ninoy|special|lunar/i.test(name);

    map.set(date, {
      date,
      name,
      type: isSpecial ? 'special' : 'regular'
    });
  }

  // Merge any local algorithmic holidays to ensure complete coverage
  for (const l of local) {
    if (!map.has(l.date)) {
      map.set(l.date, l);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetches Philippine holidays for a given year using Google Calendar official feed / API with local fallback & memory cache.
 */
export async function fetchPhilippineHolidaysForYear(year: number): Promise<PhilippineHoliday[]> {
  if (holidaysCache.has(year)) {
    return holidaysCache.get(year)!;
  }

  // 1. Try backend /api/holidays endpoint first (avoids browser CORS issues)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`/api/holidays?year=${year}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        holidaysCache.set(year, data);
        return data;
      }
    }
  } catch {
    // Non-fatal, proceed to direct feed fetch
  }

  // 2. Direct fetch from Google Calendar official feed (works in Node, SSR, or unblocked environments)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(GCAL_PH_FEED_URL, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const icsText = await response.text();
      const parsed = parseGoogleCalendarIcs(icsText, year);
      if (parsed.length > 0) {
        holidaysCache.set(year, parsed);
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Google Calendar feed unavailable or timed out, using built-in Philippine calendar:', error);
  }

  // 3. Fallback to built-in algorithmic Philippine calendar
  const localList = getLocalPhilippineHolidaysForYear(year);
  holidaysCache.set(year, localList);
  return localList;
}

/**
 * Returns a map of Philippine holidays for a specific month (0-indexed).
 */
export async function getPhilippineHolidaysForMonthAsync(
  year: number,
  month: number
): Promise<Map<string, PhilippineHoliday>> {
  const all = await fetchPhilippineHolidaysForYear(year);
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const map = new Map<string, PhilippineHoliday>();

  for (const h of all) {
    if (h.date.startsWith(monthStr)) {
      map.set(h.date, h);
    }
  }

  return map;
}

/**
 * Synchronous version using cached/local list.
 */
export function getPhilippineHolidaysForMonthSync(
  year: number,
  month: number
): Map<string, PhilippineHoliday> {
  const all = holidaysCache.has(year) ? holidaysCache.get(year)! : getLocalPhilippineHolidaysForYear(year);
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const map = new Map<string, PhilippineHoliday>();

  for (const h of all) {
    if (h.date.startsWith(monthStr)) {
      map.set(h.date, h);
    }
  }

  return map;
}
