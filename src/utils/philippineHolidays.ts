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

/**
 * Fetches Philippine holidays for a given year using live API with local fallback & memory cache.
 */
export async function fetchPhilippineHolidaysForYear(year: number): Promise<PhilippineHoliday[]> {
  if (holidaysCache.has(year)) {
    return holidaysCache.get(year)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const apiHolidays: PhilippineHoliday[] = data.map((item: any) => ({
          date: item.date,
          name: item.name || item.localName,
          type: item.types && item.types.includes('Optional') ? 'special' : 'regular'
        }));

        // Merge with local list to ensure specialized Philippine non-working days (e.g., Dec 8, Dec 24)
        const local = getLocalPhilippineHolidaysForYear(year);
        const map = new Map<string, PhilippineHoliday>();
        apiHolidays.forEach(h => map.set(h.date, h));
        local.forEach(h => {
          if (!map.has(h.date)) map.set(h.date, h);
        });

        const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
        holidaysCache.set(year, merged);
        return merged;
      }
    }
  } catch (error) {
    console.warn('Live holiday API unavailable or timed out, using built-in Philippine calendar:', error);
  }

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
