import express from 'express';

const router = express.Router();

export interface PhilippineHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'regular' | 'special';
}

const GCAL_PH_FEED_URL =
  'https://calendar.google.com/calendar/ical/en.philippines%23holiday%40group.v.calendar.google.com/public/basic.ics';

// Cache raw ICS text for 12 hours in server memory
let cachedIcsText: string | null = null;
let lastIcsFetchTime = 0;
const ICS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// In-memory year-level parsed holidays cache
const parsedYearCache = new Map<number, PhilippineHoliday[]>();

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

function getLastMondayOfAugust(year: number): number {
  const lastDay = new Date(year, 7, 31);
  const dayOfWeek = lastDay.getDay();
  const offset = (dayOfWeek - 1 + 7) % 7;
  return 31 - offset;
}

export function getLocalPhilippineHolidaysForYear(year: number): PhilippineHoliday[] {
  const holidays: PhilippineHoliday[] = [];
  const format = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

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

router.get('/', async (req, res) => {
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

  if (parsedYearCache.has(year)) {
    return res.json(parsedYearCache.get(year));
  }

  const now = Date.now();
  if (!cachedIcsText || now - lastIcsFetchTime > ICS_CACHE_TTL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(GCAL_PH_FEED_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        cachedIcsText = await response.text();
        lastIcsFetchTime = now;
      }
    } catch (err) {
      console.warn('Failed to fetch Google Calendar Philippine holiday feed on server:', err);
    }
  }

  if (cachedIcsText) {
    const holidays = parseGoogleCalendarIcs(cachedIcsText, year);
    if (holidays.length > 0) {
      parsedYearCache.set(year, holidays);
      return res.json(holidays);
    }
  }

  // Fallback to local calculation
  const fallback = getLocalPhilippineHolidaysForYear(year);
  parsedYearCache.set(year, fallback);
  return res.json(fallback);
});

export default router;
