import { ShiftType } from '../types';
import { getPhilippineHolidaysForMonthAsync, PhilippineHoliday } from './philippineHolidays';

export interface ScheduleResult {
  userId: number;
  dateStr: string;
  shift: ShiftType;
  hours: number;
}

export interface GeneratorOptions {
  exemptEveningUserIds?: number[];
}

export interface UserScheduleState {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  gender: string;
  department_id?: number;
  department_name?: string;
  blocks_m: number;
  blocks_e: number;
  target_m: number;
  target_e: number;
  totalHours: number;
  isExemptEvening: boolean;
  schedule: (ShiftType | null)[];
}

interface BlockInterval {
  d1: number;
  d2: number;
  restDay?: number;
  isHolidayBlock: boolean;
}

function shuffleArray<T>(arr: T[]): T[] {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getWeekOfMonth(year: number, month: number, day: number): number {
  const firstDay = new Date(year, month, 1).getDay();
  return Math.ceil((day + firstDay) / 7);
}

/**
 * MonthlyScheduleGenerator
 * 
 * Constraints enforced:
 *  1. Non-exempt: 2 Morning sets + 1 Evening set. Exempt: 3 Morning sets + 0 Evening sets.
 *  2. Each 2-person shift team (same [d1,d2] block): max 1 Female.
 *  3. PER-DAY female cap: max 2 females on 12h-m, max 1 female on 12h-e.
 *  4. Department diversity: no 2 from same department in a team.
 *  5. Weekly spacing: max 1 set per calendar week per employee.
 *  6. Buffer: at least 2 days between 12h shifts for same employee.
 *  7. Holiday staffing: >= 2 morning + >= 2 evening on every public holiday.
 *  8. Mandatory rest day (off) after evening set.
 *  9. Exactly 176 total hours per non-IT employee.
 * 10. IT Regulars: 8h weekdays, holiday on holidays, free on weekends.
 */
export class MonthlyScheduleGenerator {
  static async generate(
    allUsers: any[],
    year: number,
    month: number, // 0-indexed
    options: GeneratorOptions = {}
  ): Promise<ScheduleResult[]> {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const holidaysMap = await getPhilippineHolidaysForMonthAsync(year, month);
    const exemptEveningSet = new Set(options.exemptEveningUserIds || []);

    const itUsers = allUsers.filter(u => u.department_name === 'IT Regular');
    const nonItUsers = allUsers.filter(u => u.department_name !== 'IT Regular');

    if (nonItUsers.length < 8) {
      throw new Error(
        `Insufficient non-IT staff. At least 8 non-IT employees are required (found ${nonItUsers.length}).`
      );
    }

    const maxRetries = 2000;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const schedule = this.attemptGeneration(
          nonItUsers, itUsers, year, month, daysInMonth, holidaysMap, exemptEveningSet
        );
        if (schedule) return schedule;
      } catch {
        // Retry
      }
    }

    throw new Error(
      'Failed to generate a valid schedule satisfying all constraints. Please verify staff distribution and try again.'
    );
  }

  private static buildAllBlocks(daysInMonth: number, holidayDays: number[]): BlockInterval[] {
    const hSet = new Set(holidayDays);
    const blocks: BlockInterval[] = [];

    // Every consecutive 2-day pair [d, d+1] for d = 1..daysInMonth-1
    for (let d = 1; d < daysInMonth; d++) {
      const isHB = hSet.has(d) || hSet.has(d + 1);
      blocks.push({
        d1: d,
        d2: d + 1,
        restDay: d + 2 <= daysInMonth ? d + 2 : undefined,
        isHolidayBlock: isHB,
      });
    }

    return blocks;
  }

  // Count females on a specific shift type on a given day
  private static countFemalesOnDay(
    userStates: UserScheduleState[],
    day: number,
    shiftType: '12h-m' | '12h-e'
  ): number {
    return userStates.filter(o => o.schedule[day] === shiftType && o.gender === 'Female').length;
  }

  // Count all staff on a specific shift type on a given day
  private static countStaffOnDay(
    userStates: UserScheduleState[],
    day: number,
    shiftType: '12h-m' | '12h-e'
  ): number {
    return userStates.filter(o => o.schedule[day] === shiftType).length;
  }

  // Get block teammates: people on the exact same [d1,d2] with a given shift type
  private static getBlockTeammates(
    userStates: UserScheduleState[],
    d1: number,
    d2: number,
    shiftType: '12h-m' | '12h-e'
  ): UserScheduleState[] {
    return userStates.filter(o => o.schedule[d1] === shiftType && o.schedule[d2] === shiftType);
  }

  // Check if user has any 12h shift in the given calendar week
  private static hasShiftInWeek(
    user: UserScheduleState,
    year: number,
    month: number,
    week: number,
    daysInMonth: number
  ): boolean {
    for (let d = 1; d <= daysInMonth; d++) {
      if ((user.schedule[d] === '12h-m' || user.schedule[d] === '12h-e') &&
          getWeekOfMonth(year, month, d) === week) {
        return true;
      }
    }
    return false;
  }

  // Check buffer zone: no 12h shift within 2 days of [d1, d2]
  private static hasBufferConflict(
    user: UserScheduleState,
    d1: number,
    d2: number,
    daysInMonth: number
  ): boolean {
    for (let d = Math.max(1, d1 - 2); d <= Math.min(daysInMonth, d2 + 2); d++) {
      if (user.schedule[d] === '12h-m' || user.schedule[d] === '12h-e') return true;
    }
    return false;
  }

  private static attemptGeneration(
    nonItUsers: any[],
    itUsers: any[],
    year: number,
    month: number,
    daysInMonth: number,
    holidaysMap: Map<string, PhilippineHoliday>,
    exemptEveningSet: Set<number>
  ): ScheduleResult[] | null {
    const isHoliday = (d: number) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return holidaysMap.has(dateStr);
    };

    const isWeekend = (d: number) => {
      const day = new Date(year, month, d).getDay();
      return day === 0 || day === 6;
    };

    const isWeekendOrHoliday = (d: number) => isWeekend(d) || isHoliday(d);

    const holidayDays: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (isHoliday(d)) holidayDays.push(d);
    }

    const allBlocks = this.buildAllBlocks(daysInMonth, holidayDays);

    // Randomize and prioritize constrained staff (Females first, then HOMIS, then Exempt)
    const randomized = shuffleArray(nonItUsers);
    const orderedUsers = randomized.sort((a: any, b: any) => {
      const aScore = (a.gender === 'Female' ? 20 : 0)
        + (a.department_name === 'HOMIS Support' ? 10 : 0)
        + (exemptEveningSet.has(a.id) ? 5 : 0);
      const bScore = (b.gender === 'Female' ? 20 : 0)
        + (b.department_name === 'HOMIS Support' ? 10 : 0)
        + (exemptEveningSet.has(b.id) ? 5 : 0);
      return bScore - aScore;
    });

    const userStates: UserScheduleState[] = orderedUsers.map((u: any) => {
      const isExempt = exemptEveningSet.has(u.id);
      const isFemale = (u.gender || 'Male') === 'Female';
      // Females ALWAYS get 2 morning sets (even if exempt).
      // Only MALE exempt gets 3 morning sets.
      const target_m = (isExempt && !isFemale) ? 3 : 2;
      const target_e = isExempt ? 0 : 1;
      return {
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        gender: u.gender || 'Male',
        department_id: u.department_id,
        department_name: u.department_name || '',
        blocks_m: 0,
        blocks_e: 0,
        target_m,
        target_e,
        totalHours: 0,
        isExemptEvening: isExempt,
        schedule: Array(daysInMonth + 1).fill(null),
      };
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Assign Evening Shift Sets (exactly 1 per non-exempt)
    // ═══════════════════════════════════════════════════════════════════
    const eveningUsers = shuffleArray(userStates.filter(u => u.target_e === 1));
    for (const u of eveningUsers) {
      const validBlocks = allBlocks.filter(b => {
        const { d1, d2 } = b;
        if (u.schedule[d1] !== null || u.schedule[d2] !== null) return false;

        // Day-level cap: max 2 evening staff per day
        if (this.countStaffOnDay(userStates, d1, '12h-e') >= 2) return false;
        if (this.countStaffOnDay(userStates, d2, '12h-e') >= 2) return false;

        // Block team cap: max 2 per block team
        const teammates = this.getBlockTeammates(userStates, d1, d2, '12h-e');
        if (teammates.length >= 1) {
          // Gender diversity: never 2 females in same evening block team
          if (u.gender === 'Female' && teammates.some(o => o.gender === 'Female')) return false;
        }

        // PER-DAY female cap for evening: max 1 female on 12h-e per day (since only 2 staff per day)
        if (u.gender === 'Female') {
          if (this.countFemalesOnDay(userStates, d1, '12h-e') >= 1) return false;
          if (this.countFemalesOnDay(userStates, d2, '12h-e') >= 1) return false;
        }

        // Buffer: no existing 12h within 2 days
        if (this.hasBufferConflict(u, d1, d2, daysInMonth)) return false;

        // Weekly spacing: max 1 set per week
        const w1 = getWeekOfMonth(year, month, d1);
        const w2 = getWeekOfMonth(year, month, d2);
        if (this.hasShiftInWeek(u, year, month, w1, daysInMonth)) return false;
        if (w2 !== w1 && this.hasShiftInWeek(u, year, month, w2, daysInMonth)) return false;

        // Rest day available
        const restDay = d2 + 1;
        if (restDay <= daysInMonth && u.schedule[restDay] !== null) return false;

        return true;
      });

      if (validBlocks.length === 0) return null;

      // Prioritize holiday blocks (to ensure holiday staffing)
      validBlocks.sort((a, b) => {
        const aHScore = (holidayDays.includes(a.d1) ? 1 : 0) + (holidayDays.includes(a.d2) ? 1 : 0);
        const bHScore = (holidayDays.includes(b.d1) ? 1 : 0) + (holidayDays.includes(b.d2) ? 1 : 0);

        // Prefer holiday blocks that are understaffed
        const aHCount = (holidayDays.includes(a.d1) ? this.countStaffOnDay(userStates, a.d1, '12h-e') : 2) +
                        (holidayDays.includes(a.d2) ? this.countStaffOnDay(userStates, a.d2, '12h-e') : 2);
        const bHCount = (holidayDays.includes(b.d1) ? this.countStaffOnDay(userStates, b.d1, '12h-e') : 2) +
                        (holidayDays.includes(b.d2) ? this.countStaffOnDay(userStates, b.d2, '12h-e') : 2);

        if (aHScore !== bHScore) return bHScore - aHScore; // Holiday blocks first
        if (aHCount !== bHCount) return aHCount - bHCount; // Least staffed first

        // General balance: prefer blocks with fewer staff
        const countA = this.countStaffOnDay(userStates, a.d1, '12h-e') + this.countStaffOnDay(userStates, a.d2, '12h-e');
        const countB = this.countStaffOnDay(userStates, b.d1, '12h-e') + this.countStaffOnDay(userStates, b.d2, '12h-e');
        return countA - countB || Math.random() - 0.5;
      });

      const picked = validBlocks[0];
      u.schedule[picked.d1] = '12h-e';
      u.schedule[picked.d2] = '12h-e';
      u.blocks_e = 1;

      // Mandatory rest day after evening
      const restDay = picked.d2 + 1;
      if (restDay <= daysInMonth) {
        u.schedule[restDay] = isWeekendOrHoliday(restDay) ? 'free' : 'off';
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Assign Morning Shift Sets (3 for exempt, 2 for non-exempt)
    // ═══════════════════════════════════════════════════════════════════
    // Process users round-robin: assign 1 morning set at a time per user
    const morningOrder = shuffleArray([...userStates]);
    // Sort so females and constrained users go first
    morningOrder.sort((a, b) => {
      const aScore = (a.gender === 'Female' ? 20 : 0) + (a.isExemptEvening ? 5 : 0);
      const bScore = (b.gender === 'Female' ? 20 : 0) + (b.isExemptEvening ? 5 : 0);
      return bScore - aScore;
    });

    // Round-robin: assign 1 block per user at a time, repeat until all targets met
    let anyAssigned = true;
    while (anyAssigned) {
      anyAssigned = false;
      for (const u of morningOrder) {
        if (u.blocks_m >= u.target_m) continue;

        const validBlocks = allBlocks.filter(b => {
          const { d1, d2 } = b;
          if (u.schedule[d1] !== null || u.schedule[d2] !== null) return false;

          // Weekly spacing
          const w1 = getWeekOfMonth(year, month, d1);
          const w2 = getWeekOfMonth(year, month, d2);
          if (this.hasShiftInWeek(u, year, month, w1, daysInMonth)) return false;
          if (w2 !== w1 && this.hasShiftInWeek(u, year, month, w2, daysInMonth)) return false;

          // Buffer: at least 2 days gap
          if (this.hasBufferConflict(u, d1, d2, daysInMonth)) return false;

          // Block team cap: max 2 per morning block team
          const teammates = this.getBlockTeammates(userStates, d1, d2, '12h-m');
          if (teammates.length >= 2) return false;

          // Gender diversity within block team: max 1 female per team
          if (u.gender === 'Female' && teammates.some(o => o.gender === 'Female')) return false;

          // ★ PER-DAY FEMALE CAP: STRICT max 1 female on 12h-m on any day ★
          // No two females on same shift type on same day, period.
          if (u.gender === 'Female') {
            if (this.countFemalesOnDay(userStates, d1, '12h-m') >= 1) return false;
            if (this.countFemalesOnDay(userStates, d2, '12h-m') >= 1) return false;
          }

          // Day-level staff cap: max 4 morning staff per day
          if (this.countStaffOnDay(userStates, d1, '12h-m') >= 4) return false;
          if (this.countStaffOnDay(userStates, d2, '12h-m') >= 4) return false;

          return true;
        });

        if (validBlocks.length === 0) return null;

        // Prioritize: holiday blocks first, then balance
        validBlocks.sort((a, b) => {
          const aHScore = (holidayDays.includes(a.d1) ? 1 : 0) + (holidayDays.includes(a.d2) ? 1 : 0);
          const bHScore = (holidayDays.includes(b.d1) ? 1 : 0) + (holidayDays.includes(b.d2) ? 1 : 0);

          const aHCount = (holidayDays.includes(a.d1) ? this.countStaffOnDay(userStates, a.d1, '12h-m') : 2) +
                          (holidayDays.includes(a.d2) ? this.countStaffOnDay(userStates, a.d2, '12h-m') : 2);
          const bHCount = (holidayDays.includes(b.d1) ? this.countStaffOnDay(userStates, b.d1, '12h-m') : 2) +
                          (holidayDays.includes(b.d2) ? this.countStaffOnDay(userStates, b.d2, '12h-m') : 2);

          if (aHScore !== bHScore) return bHScore - aHScore;
          if (aHCount !== bHCount) return aHCount - bHCount;

          const countA = this.countStaffOnDay(userStates, a.d1, '12h-m') + this.countStaffOnDay(userStates, a.d2, '12h-m');
          const countB = this.countStaffOnDay(userStates, b.d1, '12h-m') + this.countStaffOnDay(userStates, b.d2, '12h-m');
          return countA - countB || Math.random() - 0.5;
        });

        const picked = validBlocks[0];
        u.schedule[picked.d1] = '12h-m';
        u.schedule[picked.d2] = '12h-m';
        u.blocks_m++;
        anyAssigned = true;
      }
    }

    // Check all users met their morning targets
    for (const u of userStates) {
      if (u.blocks_m < u.target_m) return null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // VERIFICATION: Holiday staffing, gender, department
    // ═══════════════════════════════════════════════════════════════════
    for (const hDay of holidayDays) {
      const mCount = this.countStaffOnDay(userStates, hDay, '12h-m');
      const eCount = this.countStaffOnDay(userStates, hDay, '12h-e');
      if (mCount < 2 || eCount < 2) return null;
    }

    // Verify per-day female limits: STRICT max 1 female per shift type per day
    for (let d = 1; d <= daysInMonth; d++) {
      if (this.countFemalesOnDay(userStates, d, '12h-m') > 1) return null;
      if (this.countFemalesOnDay(userStates, d, '12h-e') > 1) return null;
    }

    // Verify per-block team gender diversity (no 2 females in same team)
    for (const b of allBlocks) {
      const mTeam = this.getBlockTeammates(userStates, b.d1, b.d2, '12h-m');
      const eTeam = this.getBlockTeammates(userStates, b.d1, b.d2, '12h-e');
      if (mTeam.filter(u => u.gender === 'Female').length > 1) return null;
      if (eTeam.filter(u => u.gender === 'Female').length > 1) return null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: Exact 176 Hours Balancing with 8-Hour Weekday Shifts
    // ═══════════════════════════════════════════════════════════════════
    for (const u of userStates) {
      let hours12h = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (u.schedule[d] === '12h-m' || u.schedule[d] === '12h-e') {
          hours12h += 12;
        }
      }

      const remainingHours = Math.max(0, 176 - hours12h);
      const needed8hShifts = Math.floor(remainingHours / 8);

      // Collect available weekday slots (null and not weekend/holiday)
      const availableWeekdays: number[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        if (u.schedule[d] === null && !isWeekendOrHoliday(d)) {
          availableWeekdays.push(d);
        }
      }

      // If not enough regular weekdays, also allow 'off' (rest) days to be converted back
      const offDays: number[] = [];
      if (availableWeekdays.length < needed8hShifts) {
        for (let d = 1; d <= daysInMonth; d++) {
          if (u.schedule[d] === 'off' && !isWeekendOrHoliday(d)) {
            offDays.push(d);
          }
        }
      }

      // Assign 8h shifts: first from available weekdays, then from off days
      const shuffledWeekdays = shuffleArray(availableWeekdays);
      let assigned = 0;
      for (const day of shuffledWeekdays) {
        if (assigned >= needed8hShifts) break;
        u.schedule[day] = '8h';
        assigned++;
      }

      // If still short, convert off days to 8h
      if (assigned < needed8hShifts) {
        const shuffledOff = shuffleArray(offDays);
        for (const day of shuffledOff) {
          if (assigned >= needed8hShifts) break;
          u.schedule[day] = '8h';
          assigned++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3: Fill remaining days
    // ═══════════════════════════════════════════════════════════════════
    for (const u of userStates) {
      for (let d = 1; d <= daysInMonth; d++) {
        if (u.schedule[d] === null) {
          if (isHoliday(d)) {
            u.schedule[d] = 'holiday';
          } else if (isWeekend(d)) {
            u.schedule[d] = 'free';
          } else {
            u.schedule[d] = 'off';
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FINAL HOUR VERIFICATION: Ensure exactly 176h per non-IT employee
    // ═══════════════════════════════════════════════════════════════════
    for (const u of userStates) {
      let totalHours = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (u.schedule[d] === '12h-m' || u.schedule[d] === '12h-e') totalHours += 12;
        else if (u.schedule[d] === '8h') totalHours += 8;
      }
      if (totalHours !== 176) return null; // Reject if hours don't match
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4: Populate IT Regulars
    // ═══════════════════════════════════════════════════════════════════
    const itUserStates = itUsers.map((u: any) => {
      const schedule: (ShiftType | null)[] = Array(daysInMonth + 1).fill(null);
      for (let d = 1; d <= daysInMonth; d++) {
        if (isHoliday(d)) {
          schedule[d] = 'holiday';
        } else if (isWeekend(d)) {
          schedule[d] = 'free';
        } else {
          schedule[d] = '8h';
        }
      }
      return { id: u.id, schedule };
    });

    // ═══════════════════════════════════════════════════════════════════
    // Compile results
    // ═══════════════════════════════════════════════════════════════════
    const results: ScheduleResult[] = [];

    for (const u of userStates) {
      for (let d = 1; d <= daysInMonth; d++) {
        const shift = u.schedule[d]!;
        let hours = 0;
        if (shift === '12h-m' || shift === '12h-e') hours = 12;
        else if (shift === '8h') hours = 8;

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        results.push({ userId: u.id, dateStr, shift, hours });
      }
    }

    for (const u of itUserStates) {
      for (let d = 1; d <= daysInMonth; d++) {
        const shift = u.schedule[d]!;
        const hours = shift === '8h' ? 8 : 0;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        results.push({ userId: u.id, dateStr, shift, hours });
      }
    }

    return results;
  }
}
