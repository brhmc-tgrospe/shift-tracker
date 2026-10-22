import { ShiftType } from '../types';
import { getPhilippineHolidaysForMonthAsync, getPhilippineHolidaysForMonthSync, PhilippineHoliday } from './philippineHolidays';
import { calculateRenderedHours } from './hours';

export interface ScheduleResult {
  userId: number;
  dateStr: string;
  shift: ShiftType;
  hours: number;
}

export interface GeneratorOptions {
  exemptEveningUserIds?: number[];
}

export interface SchedulingUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  gender?: 'Male' | 'Female' | string;
  role?: string;
  department_id?: number;
  department_name?: string;
}

export interface EveningSlot {
  id: number;
  d1: number;
  d2: number;
  calendarWeek: number;
  assignedUserIds: number[];
}

export interface EmployeeState {
  id: number;
  user: SchedulingUser;
  isExemptEvening: boolean;
  schedule: Map<number, ShiftType>;
  lockedDays: Map<number, ShiftType>;
  maxEveningBlocks: number;
  assignedEveningBlocks: number;
  targetMorningDays: number;
  assigned12hDays: Set<number>;
  assigned12hWeeks: Map<number, number>;
  totalRenderedHours: number;
}

export interface DailyShiftAuditRow {
  day: number;
  dateStr: string;
  eveningStaff: string[];
  eveningMales: number;
  eveningFemales: number;
  eveningDepartments: string[];
  morningStaff: string[];
  morningMales: number;
  morningFemales: number;
  morningDepartments: string[];
  // Legacy aliases
  males: number;
  females: number;
  departments: string[];
  isHoliday: boolean;
  status: 'PASS' | 'DEFICIT' | 'VIOLATION';
}

export type DailyEveningAuditRow = DailyShiftAuditRow;

export interface GenerationAudit {
  isValid: boolean;
  targetMonthStr: string;
  totalDays: number;
  eveningDeficitDays: number;
  morningDeficitDays: number;
  deficitDays: number; // backward compatibility alias
  femaleViolations: number;
  maleViolations: number;
  departmentViolations: number;
  hoursViolations: number;
  rows: DailyShiftAuditRow[];
  errors: string[];
}

export interface ValidationResult {
  isValid: boolean;
  requiredEveningSlots: number;
  totalEveningSeats: number;
  totalMorningSeats: number;
  total12hSeats: number;
  eligibleNonExemptCount: number;
  maleNonExemptCount: number;
  distinctDepartmentsCount: number;
  estimatedBlocksPerStaff: number;
  warnings: string[];
  errors: string[];
}

/**
 * Normalizes day to standard Sunday-start calendar week of month
 */
export function getCalendarWeek(year: number, month: number, day: number): number {
  const firstDay = new Date(year, month, 1);
  return Math.ceil((day + firstDay.getDay()) / 7);
}

/**
 * Builds the 2-day consecutive slots covering Days 1..daysInMonth
 */
export function buildEveningSlots(daysInMonth: number, year: number, month: number): EveningSlot[] {
  const slots: EveningSlot[] = [];
  let slotId = 0;
  for (let d = 1; d <= daysInMonth; d += 2) {
    const d1 = d;
    const d2 = d + 1 <= daysInMonth ? d + 1 : d;
    slots.push({
      id: slotId++,
      d1,
      d2,
      calendarWeek: getCalendarWeek(year, month, d1),
      assignedUserIds: [],
    });
  }
  return slots;
}

/**
 * Validates candidate eligibility for an evening slot
 */
function isEligibleForEveningSlot(
  emp: EmployeeState,
  slot: EveningSlot,
  daysInMonth: number
): boolean {
  if (emp.isExemptEvening) return false;
  if (emp.assignedEveningBlocks >= emp.maxEveningBlocks) return false;

  const { d1, d2, calendarWeek } = slot;
  const currentWeekBlocks = emp.assigned12hWeeks.get(calendarWeek) || 0;
  if (currentWeekBlocks >= 2) return false;

  if (emp.schedule.has(d1) || emp.schedule.has(d2)) return false;
  if (emp.lockedDays.has(d1) || emp.lockedDays.has(d2)) return false;

  // Enforce >= 2-day gap between distinct 12h evening blocks
  const minCheck = Math.max(1, d1 - 2);
  const maxCheck = Math.min(daysInMonth, d2 + 2);
  for (let d = minCheck; d <= maxCheck; d++) {
    if (d === d1 || d === d2) continue;
    if (emp.assigned12hDays.has(d)) return false;
  }

  return true;
}

/**
 * STEP 1: Solves evening shifts using Backtracking with MRV and Quota Balancing
 */
function solveEveningSlots(
  slots: EveningSlot[],
  employees: EmployeeState[],
  daysInMonth: number,
  isHoliday: (d: number) => boolean,
  isWeekend: (d: number) => boolean
): boolean {
  function getValidPairsForSlot(slot: EveningSlot): [EmployeeState, EmployeeState][] {
    const eligible = employees.filter(e => isEligibleForEveningSlot(e, slot, daysInMonth));
    const pairs: [EmployeeState, EmployeeState][] = [];

    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const empA = eligible[i];
        const empB = eligible[j];

        // Never pair 2 Females
        if (empA.user.gender === 'Female' && empB.user.gender === 'Female') continue;

        // Distinct departments
        const deptA = empA.user.department_id || empA.user.department_name;
        const deptB = empB.user.department_id || empB.user.department_name;
        if (deptA && deptB && deptA === deptB) continue;

        pairs.push([empA, empB]);
      }
    }

    // Heuristics:
    // 1. Strongly prioritize staff with 0 evening blocks so EVERY non-exempt employee gets 1 set first!
    // 2. Prioritize 1 Male + 1 Female over 2 Males to preserve male quota for morning!
    pairs.sort((p1, p2) => {
      const p1Unassigned = (p1[0].assignedEveningBlocks === 0 ? -500 : 0) + (p1[1].assignedEveningBlocks === 0 ? -500 : 0);
      const p2Unassigned = (p2[0].assignedEveningBlocks === 0 ? -500 : 0) + (p2[1].assignedEveningBlocks === 0 ? -500 : 0);

      const p1Mixed = (p1[0].user.gender !== p1[1].user.gender) ? -100 : 0;
      const p2Mixed = (p2[0].user.gender !== p2[1].user.gender) ? -100 : 0;

      const score1 = p1Unassigned + p1Mixed + p1[0].assignedEveningBlocks + p1[1].assignedEveningBlocks;
      const score2 = p2Unassigned + p2Mixed + p2[0].assignedEveningBlocks + p2[1].assignedEveningBlocks;
      return score1 - score2;
    });

    return pairs;
  }

  function forwardCheck(nextSlotIndex: number): boolean {
    for (let i = nextSlotIndex; i < slots.length; i++) {
      if (getValidPairsForSlot(slots[i]).length === 0) return false;
    }
    return true;
  }

  function backtrack(slotIndex: number = 0): boolean {
    if (slotIndex >= slots.length) return true;

    const slot = slots[slotIndex];
    const candidatePairs = getValidPairsForSlot(slot);
    if (candidatePairs.length === 0) return false;

    const { d1, d2, calendarWeek } = slot;
    const restDay = d2 + 1;

    for (const [empA, empB] of candidatePairs) {
      empA.schedule.set(d1, '12h-e');
      empA.assigned12hDays.add(d1);
      if (d2 !== d1) {
        empA.schedule.set(d2, '12h-e');
        empA.assigned12hDays.add(d2);
      }
      empA.assigned12hWeeks.set(calendarWeek, (empA.assigned12hWeeks.get(calendarWeek) || 0) + 1);
      empA.assignedEveningBlocks++;

      const hadRestA = empA.schedule.has(restDay);
      const prevRestA = empA.schedule.get(restDay);
      if (restDay <= daysInMonth) {
        const rShift = isHoliday(restDay) ? 'holiday' : isWeekend(restDay) ? 'free' : 'off';
        empA.schedule.set(restDay, rShift);
        empA.lockedDays.set(restDay, rShift);
      }

      empB.schedule.set(d1, '12h-e');
      empB.assigned12hDays.add(d1);
      if (d2 !== d1) {
        empB.schedule.set(d2, '12h-e');
        empB.assigned12hDays.add(d2);
      }
      empB.assigned12hWeeks.set(calendarWeek, (empB.assigned12hWeeks.get(calendarWeek) || 0) + 1);
      empB.assignedEveningBlocks++;

      const hadRestB = empB.schedule.has(restDay);
      const prevRestB = empB.schedule.get(restDay);
      if (restDay <= daysInMonth) {
        const rShift = isHoliday(restDay) ? 'holiday' : isWeekend(restDay) ? 'free' : 'off';
        empB.schedule.set(restDay, rShift);
        empB.lockedDays.set(restDay, rShift);
      }

      slot.assignedUserIds = [empA.id, empB.id];

      if (forwardCheck(slotIndex + 1)) {
        if (backtrack(slotIndex + 1)) return true;
      }

      // Revert
      slot.assignedUserIds = [];
      empA.schedule.delete(d1);
      empA.assigned12hDays.delete(d1);
      if (d2 !== d1) {
        empA.schedule.delete(d2);
        empA.assigned12hDays.delete(d2);
      }
      const curWA = (empA.assigned12hWeeks.get(calendarWeek) || 1) - 1;
      if (curWA <= 0) empA.assigned12hWeeks.delete(calendarWeek);
      else empA.assigned12hWeeks.set(calendarWeek, curWA);
      empA.assignedEveningBlocks--;
      if (restDay <= daysInMonth) {
        if (!hadRestA) {
          empA.schedule.delete(restDay);
          empA.lockedDays.delete(restDay);
        } else if (prevRestA) {
          empA.schedule.set(restDay, prevRestA);
          empA.lockedDays.set(restDay, prevRestA);
        }
      }

      empB.schedule.delete(d1);
      empB.assigned12hDays.delete(d1);
      if (d2 !== d1) {
        empB.schedule.delete(d2);
        empB.assigned12hDays.delete(d2);
      }
      const curWB = (empB.assigned12hWeeks.get(calendarWeek) || 1) - 1;
      if (curWB <= 0) empB.assigned12hWeeks.delete(calendarWeek);
      else empB.assigned12hWeeks.set(calendarWeek, curWB);
      empB.assignedEveningBlocks--;
      if (restDay <= daysInMonth) {
        if (!hadRestB) {
          empB.schedule.delete(restDay);
          empB.lockedDays.delete(restDay);
        } else if (prevRestB) {
          empB.schedule.set(restDay, prevRestB);
          empB.lockedDays.set(restDay, prevRestB);
        }
      }
    }

    return false;
  }

  return backtrack();
}

/**
 * Checks if an employee can work a 12h-m morning shift on a given day
 * Strictly enforces single, non-consecutive days!
 */
function canWorkMorningOnDay(
  emp: EmployeeState,
  day: number,
  daysInMonth: number,
  strictGap: boolean = true
): boolean {
  if (emp.schedule.has(day)) return false;
  if (emp.lockedDays.has(day)) return false;

  // Strict non-consecutive rule: NEVER work 12h-m on day-1 or day+1
  if (day > 1 && emp.schedule.get(day - 1) === '12h-m') return false;
  if (day < daysInMonth && emp.schedule.get(day + 1) === '12h-m') return false;

  // Cannot work 12h-m immediately adjacent to 12h-e
  if (day > 1 && emp.schedule.get(day - 1) === '12h-e') return false;
  if (day < daysInMonth && emp.schedule.get(day + 1) === '12h-e') return false;

  if (strictGap) {
    // 2-day gap preference from any other 12h shift
    const minCheck = Math.max(1, day - 2);
    const maxCheck = Math.min(daysInMonth, day + 2);
    for (let d = minCheck; d <= maxCheck; d++) {
      if (d === day) continue;
      const s = emp.schedule.get(d);
      if (s === '12h-e' || s === '12h-m') return false;
    }
  }

  return true;
}

/**
 * Helper to count assigned morning shifts for an employee
 */
function getMorningCount(emp: EmployeeState): number {
  return Array.from(emp.schedule.values()).filter(s => s === '12h-m').length;
}

/**
 * STEP 2: Two-Phase Non-Consecutive Morning Shift (12h-m) Allocation
 * Phase 2A: Guarantees >= 2 staff on 12h-m every calendar day (via MRV Backtracking).
 * Phase 2B: Quota Completion Pass ensures every employee reaches their 4 (or 6) shifts.
 */
function solveMorningShifts(
  employees: EmployeeState[],
  daysInMonth: number,
  year: number,
  month: number,
  max12hShifts: number
): boolean {
  const isSmallRoster = employees.length < 15;

  // Set exact targetMorningDays per employee to guarantee EVEN 12h parity and <= 176h!
  for (const emp of employees) {
    const eveDays = Array.from(emp.schedule.values()).filter(s => s === '12h-e').length;
    const maxAllowedMorning = max12hShifts - eveDays;

    if (emp.isExemptEvening) {
      let target = isSmallRoster ? max12hShifts : 6;
      if (target > maxAllowedMorning) target = maxAllowedMorning;
      if (target % 2 !== 0) target--;
      emp.targetMorningDays = target;
    } else if (isSmallRoster) {
      // In small roster (< 15 staff), scale to satisfy coverage while respecting 176h cap
      let target = Math.max(4, maxAllowedMorning);
      if (target > maxAllowedMorning) target = maxAllowedMorning;
      if ((eveDays + target) % 2 !== 0) {
        target--;
      }
      emp.targetMorningDays = target;
    } else {
      // Standard / realistic roster: target exactly 4 individual morning shifts!
      // If evening shifts is an odd count (e.g. 1 on Day 31 boundary), adjust to 5 or 3 so total 12h is EVEN
      let target = 4;
      if ((eveDays + target) % 2 !== 0) {
        target = (eveDays + 5 <= maxAllowedMorning) ? 5 : 3;
      }
      if (target > maxAllowedMorning) target = maxAllowedMorning;
      if ((eveDays + target) % 2 !== 0) target--;
      emp.targetMorningDays = target;
    }
  }

  // Phase 2A: MRV Backtracking to assign 2 staff per day
  const unassignedMorningDays = new Set<number>(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  function getValidMorningPairsForDay(day: number): [EmployeeState, EmployeeState][] {
    const candidates = employees.filter(e => {
      if (getMorningCount(e) >= e.targetMorningDays) return false;
      return canWorkMorningOnDay(e, day, daysInMonth, false);
    });

    const pairs: [EmployeeState, EmployeeState][] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.user.gender === 'Female' && b.user.gender === 'Female') continue;
        const deptA = a.user.department_id || a.user.department_name;
        const deptB = b.user.department_id || b.user.department_name;
        if (deptA && deptB && deptA === deptB) continue;
        pairs.push([a, b]);
      }
    }

    pairs.sort((p1, p2) => {
      const p1Mixed = (p1[0].user.gender !== p1[1].user.gender) ? -100 : 0;
      const p2Mixed = (p2[0].user.gender !== p2[1].user.gender) ? -100 : 0;

      const p1Exempt = (p1[0].isExemptEvening ? -150 : 0) + (p1[1].isExemptEvening ? -150 : 0);
      const p2Exempt = (p2[0].isExemptEvening ? -150 : 0) + (p2[1].isExemptEvening ? -150 : 0);

      const gap1 = (canWorkMorningOnDay(p1[0], day, daysInMonth, true) ? -50 : 0) + (canWorkMorningOnDay(p1[1], day, daysInMonth, true) ? -50 : 0);
      const gap2 = (canWorkMorningOnDay(p2[0], day, daysInMonth, true) ? -50 : 0) + (canWorkMorningOnDay(p2[1], day, daysInMonth, true) ? -50 : 0);

      const def1 = (p1[0].targetMorningDays - getMorningCount(p1[0])) + (p1[1].targetMorningDays - getMorningCount(p1[1]));
      const def2 = (p2[0].targetMorningDays - getMorningCount(p2[0])) + (p2[1].targetMorningDays - getMorningCount(p2[1]));

      return (p1Mixed + p1Exempt + gap1 - def1) - (p2Mixed + p2Exempt + gap2 - def2);
    });

    return pairs;
  }

  function solvePhase2ABacktrack(): boolean {
    if (unassignedMorningDays.size === 0) return true;

    // MRV: Pick the unassigned day with the fewest valid candidate pairs
    let bestDay = -1;
    let minPairs = Infinity;
    let bestPairs: [EmployeeState, EmployeeState][] = [];

    for (const d of unassignedMorningDays) {
      const pairs = getValidMorningPairsForDay(d);
      if (pairs.length === 0) return false; // Deadlock, backtrack!
      if (pairs.length < minPairs) {
        minPairs = pairs.length;
        bestDay = d;
        bestPairs = pairs;
      }
    }

    unassignedMorningDays.delete(bestDay);

    for (const [a, b] of bestPairs) {
      a.schedule.set(bestDay, '12h-m');
      a.assigned12hDays.add(bestDay);
      b.schedule.set(bestDay, '12h-m');
      b.assigned12hDays.add(bestDay);

      if (solvePhase2ABacktrack()) return true;

      a.schedule.delete(bestDay);
      a.assigned12hDays.delete(bestDay);
      b.schedule.delete(bestDay);
      b.assigned12hDays.delete(bestDay);
    }

    unassignedMorningDays.add(bestDay);
    return false;
  }

  const baseCoverageSolved = solvePhase2ABacktrack();
  if (!baseCoverageSolved) return false;

  // Phase 2B: Quota Completion Pass
  // Ensures every employee reaches their 4 (or 6) morning shifts by assigning 3rd/4th morning staff
  for (const emp of employees) {
    let curM = getMorningCount(emp);
    while (curM < emp.targetMorningDays) {
      const candidateDays: { day: number; score: number }[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        if (!canWorkMorningOnDay(emp, d, daysInMonth, false)) continue;

        const currentDayMornStaff = employees.filter(e => e.schedule.get(d) === '12h-m');
        const mornMales = currentDayMornStaff.filter(e => e.user.gender === 'Male').length;
        const mornFemales = currentDayMornStaff.filter(e => e.user.gender === 'Female').length;

        // Gender Safety: Never create an all-female morning team
        if (emp.user.gender === 'Female' && mornMales < 1) continue;

        const empDept = emp.user.department_id || emp.user.department_name;
        const hasSameDept = currentDayMornStaff.some(e => (e.user.department_id || e.user.department_name) === empDept);
        const has2DayGap = canWorkMorningOnDay(emp, d, daysInMonth, true);

        // Lower score is preferred:
        let score = currentDayMornStaff.length * 100;
        if (!has2DayGap) score += 50;
        if (hasSameDept) score += 80;
        if (emp.user.gender === 'Female' && mornFemales >= mornMales) score += 60;

        candidateDays.push({ day: d, score });
      }

      if (candidateDays.length === 0) {
        break;
      }

      candidateDays.sort((a, b) => a.score - b.score);
      const chosenDay = candidateDays[0].day;
      emp.schedule.set(chosenDay, '12h-m');
      emp.assigned12hDays.add(chosenDay);
      curM++;
    }
  }

  return true;
}

/**
 * STEP 3 & 4: Balance to 176h via 8h shifts & fill residual days
 */
function balanceTo176HoursAndFill(
  employees: EmployeeState[],
  daysInMonth: number,
  isHoliday: (d: number) => boolean,
  isWeekend: (d: number) => boolean
) {
  for (const emp of employees) {
    // Pre-credit unassigned official holidays as 'holiday' (8h credit)
    for (let d = 1; d <= daysInMonth; d++) {
      if (isHoliday(d) && !emp.schedule.has(d)) {
        emp.schedule.set(d, 'holiday');
      }
    }

    // Calculate current hours
    let currentHours = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const shift = emp.schedule.get(d);
      currentHours += calculateRenderedHours(shift, isHoliday(d));
    }

    const hoursNeeded = 176 - currentHours;
    if (hoursNeeded < 0 || hoursNeeded % 8 !== 0) {
      throw new Error(`Inconsistent hours needed for user ${emp.user.username}: ${hoursNeeded}h (currentHours=${currentHours})`);
    }

    const needed8hCount = hoursNeeded / 8;

    // Collect available weekdays
    const openWeekdays: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (!emp.schedule.has(d) && !isWeekend(d) && !isHoliday(d)) {
        openWeekdays.push(d);
      }
    }

    if (openWeekdays.length < needed8hCount) {
      throw new Error(`Not enough weekdays for user ${emp.user.username} to reach 176h (need ${needed8hCount}, open ${openWeekdays.length})`);
    }

    // Assign needed 8h shifts
    for (let i = 0; i < needed8hCount; i++) {
      emp.schedule.set(openWeekdays[i], '8h');
    }

    // Fill residual days: weekends -> 'free', weekdays -> 'off'
    for (let d = 1; d <= daysInMonth; d++) {
      if (!emp.schedule.has(d)) {
        if (isWeekend(d)) {
          emp.schedule.set(d, 'free');
        } else {
          emp.schedule.set(d, 'off');
        }
      }
    }

    // Verify exact 176h
    let total = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      total += calculateRenderedHours(emp.schedule.get(d), isHoliday(d));
    }
    emp.totalRenderedHours = total;
    if (total !== 176) {
      throw new Error(`User ${emp.user.username} total hours = ${total}, expected 176!`);
    }
  }
}

/**
 * STEP 5: Verification & Dual Audit Generation
 */
function runAudit(
  employees: EmployeeState[],
  year: number,
  month: number,
  daysInMonth: number,
  isHoliday: (d: number) => boolean
): GenerationAudit {
  const rows: DailyShiftAuditRow[] = [];
  let eveningDeficitDays = 0;
  let morningDeficitDays = 0;
  let femaleViolations = 0;
  let maleViolations = 0;
  let departmentViolations = 0;
  let hoursViolations = 0;
  const errors: string[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // Evening staff
    const eveningStaffEmps = employees.filter(e => e.schedule.get(d) === '12h-e');
    const eveningStaffNames = eveningStaffEmps.map(e => `${e.user.firstName} (${e.user.gender})`);
    const eveningFemales = eveningStaffEmps.filter(e => e.user.gender === 'Female').length;
    const eveningMales = eveningStaffEmps.filter(e => e.user.gender === 'Male').length;
    const eveningDepts = eveningStaffEmps.map(e => e.user.department_name || `Dept-${e.user.department_id}`);
    const uniqueEveningDepts = new Set(eveningDepts);

    // Morning staff
    const morningStaffEmps = employees.filter(e => e.schedule.get(d) === '12h-m');
    const morningStaffNames = morningStaffEmps.map(e => `${e.user.firstName} (${e.user.gender})`);
    const morningFemales = morningStaffEmps.filter(e => e.user.gender === 'Female').length;
    const morningMales = morningStaffEmps.filter(e => e.user.gender === 'Male').length;
    const morningDepts = morningStaffEmps.map(e => e.user.department_name || `Dept-${e.user.department_id}`);
    const uniqueMorningDepts = new Set(morningDepts);

    // Evening violations
    const isEveningDeficit = eveningStaffEmps.length < 2;
    const isEveningFemaleViol = eveningFemales > 1;
    const isEveningMaleViol = eveningMales < 1;
    const isEveningDeptViol = uniqueEveningDepts.size < eveningStaffEmps.length;

    // Morning violations: >= 2 staff, >= 1 male, never an all-female team, >= 2 distinct departments
    const isMorningDeficit = morningStaffEmps.length < 2;
    const isMorningFemaleViol = morningFemales === morningStaffEmps.length && morningFemales > 0;
    const isMorningMaleViol = morningMales < 1;
    const isMorningDeptViol = uniqueMorningDepts.size < Math.min(2, morningStaffEmps.length);

    if (isEveningDeficit) eveningDeficitDays++;
    if (isMorningDeficit) morningDeficitDays++;
    if (isEveningFemaleViol || isMorningFemaleViol) femaleViolations++;
    if (isEveningMaleViol || isMorningMaleViol) maleViolations++;
    if (isEveningDeptViol || isMorningDeptViol) departmentViolations++;

    const isDeficit = isEveningDeficit || isMorningDeficit;
    const isViol = isEveningFemaleViol || isEveningMaleViol || isEveningDeptViol ||
                   isMorningFemaleViol || isMorningMaleViol || isMorningDeptViol;
    const status: 'PASS' | 'DEFICIT' | 'VIOLATION' = isDeficit ? 'DEFICIT' : (isViol ? 'VIOLATION' : 'PASS');

    rows.push({
      day: d,
      dateStr,
      eveningStaff: eveningStaffNames,
      eveningMales,
      eveningFemales,
      eveningDepartments: eveningDepts,
      morningStaff: morningStaffNames,
      morningMales,
      morningFemales,
      morningDepartments: morningDepts,
      males: eveningMales + morningMales,
      females: eveningFemales + morningFemales,
      departments: [...eveningDepts, ...morningDepts],
      isHoliday: isHoliday(d),
      status,
    });
  }

  for (const emp of employees) {
    if (emp.totalRenderedHours !== 176) {
      hoursViolations++;
      errors.push(`Staff ${emp.user.firstName} ${emp.user.lastName} has ${emp.totalRenderedHours}h (expected 176h).`);
    }
  }

  const isValid = eveningDeficitDays === 0 &&
                  morningDeficitDays === 0 &&
                  femaleViolations === 0 &&
                  maleViolations === 0 &&
                  departmentViolations === 0 &&
                  hoursViolations === 0;

  return {
    isValid,
    targetMonthStr: `${year}-${String(month + 1).padStart(2, '0')}`,
    totalDays: daysInMonth,
    eveningDeficitDays,
    morningDeficitDays,
    deficitDays: eveningDeficitDays,
    femaleViolations,
    maleViolations,
    departmentViolations,
    hoursViolations,
    rows,
    errors,
  };
}

/**
 * MonthlyScheduleGenerator
 * Production Coverage-First Dual-Coverage CSP Scheduling Engine
 */
export class MonthlyScheduleGenerator {
  private static lastAudit: GenerationAudit | null = null;

  public static getLastAudit(): GenerationAudit | null {
    return this.lastAudit;
  }

  /**
   * Upfront validation of staff pool feasibility before triggering generation
   */
  public static validateStaffPool(
    allUsers: SchedulingUser[],
    year: number,
    month: number,
    exemptEveningUserIds: number[] = []
  ): ValidationResult {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const slots = buildEveningSlots(daysInMonth, year, month);
    const requiredEveningSlots = slots.length;
    const totalEveningSeats = requiredEveningSlots * 2;
    const totalMorningSeats = requiredEveningSlots * 2;
    const total12hSeats = totalEveningSeats + totalMorningSeats;

    const exemptSet = new Set(exemptEveningUserIds);
    const nonItUsers = allUsers.filter(u => u.department_name !== 'IT Regular');
    const eligibleNonExempt = nonItUsers.filter(u => !exemptSet.has(u.id));
    const maleNonExempt = eligibleNonExempt.filter(u => u.gender === 'Male');
    const maleTotalNonIt = nonItUsers.filter(u => u.gender === 'Male');
    const distinctDepts = new Set(eligibleNonExempt.map(u => u.department_id || u.department_name));

    const warnings: string[] = [];
    const errors: string[] = [];

    // Capacity check: Dual-coverage requires enough staff to cover 4N shift-days
    const holidaysMap = getPhilippineHolidaysForMonthSync(year, month);
    const totalHolidays = holidaysMap.size;
    const max12hShifts = 2 * Math.floor((176 - (totalHolidays * 8)) / 24);
    const total12hRequired = daysInMonth * 4;
    const totalCapacity = nonItUsers.length * max12hShifts;

    if (totalCapacity < total12hRequired) {
      errors.push(
        `Insufficient staff capacity for dual 12h coverage: ${nonItUsers.length} non-IT staff can work at most ${max12hShifts} 12-hour shifts each (${totalCapacity} total) due to ${totalHolidays} holidays, but ${total12hRequired} 12-hour shifts are required (${daysInMonth} days × 4 shifts/day). At least ${Math.ceil(total12hRequired / max12hShifts)} staff are required.`
      );
    }

    const totalWeeks = getCalendarWeek(year, month, daysInMonth);
    const minRequiredNonExempt = Math.ceil(totalEveningSeats / (totalWeeks * 2));

    if (eligibleNonExempt.length < minRequiredNonExempt) {
      errors.push(
        `Insufficient non-exempt staff: ${eligibleNonExempt.length} available, but at least ${minRequiredNonExempt} are required to tile ${requiredEveningSlots} evening slots across ${totalWeeks} weeks without violating rest constraints.`
      );
    }

    if (maleNonExempt.length < 1) {
      errors.push(`At least 1 Male non-exempt employee is required in the evening pool to satisfy the gender safety policy.`);
    }

    if (maleTotalNonIt.length < 2) {
      errors.push(`At least 2 Male employees are required across non-IT staff to support simultaneous daily evening and morning teams.`);
    }

    if (distinctDepts.size < 2) {
      errors.push(`At least 2 distinct non-exempt departments are required to satisfy the department diversity rule.`);
    }

    const estimatedBlocksPerStaff = eligibleNonExempt.length > 0 ? Math.ceil(totalEveningSeats / eligibleNonExempt.length) : 0;
    if (estimatedBlocksPerStaff >= 5) {
      warnings.push(`Staff workload is high: employees will average ${estimatedBlocksPerStaff} evening blocks this month.`);
    }

    return {
      isValid: errors.length === 0,
      requiredEveningSlots,
      totalEveningSeats,
      totalMorningSeats,
      total12hSeats,
      eligibleNonExemptCount: eligibleNonExempt.length,
      maleNonExemptCount: maleNonExempt.length,
      distinctDepartmentsCount: distinctDepts.size,
      estimatedBlocksPerStaff,
      warnings,
      errors,
    };
  }

  /**
   * Generates a complete 100% compliant monthly schedule with exact per-employee quotas
   */
  public static async generate(
    allUsers: SchedulingUser[],
    year: number,
    month: number, // 0-indexed
    options: GeneratorOptions = {}
  ): Promise<ScheduleResult[]> {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const holidaysMap = await getPhilippineHolidaysForMonthAsync(year, month);
    const isHoliday = (d: number) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return holidaysMap.has(dateStr);
    };
    const isWeekend = (d: number) => {
      const day = new Date(year, month, d).getDay();
      return day === 0 || day === 6;
    };

    const totalHolidays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(isHoliday).length;
    // Maximum 12h shifts an employee can have without exceeding 176h
    const max12hShifts = 2 * Math.floor((176 - (totalHolidays * 8)) / 24);

    const exemptEveningSet = new Set(options.exemptEveningUserIds || []);
    const itUsers = allUsers.filter(u => u.department_name === 'IT Regular');
    const nonItUsers = allUsers.filter(u => u.department_name !== 'IT Regular');

    // Run upfront validation
    const validation = this.validateStaffPool(allUsers, year, month, options.exemptEveningUserIds);
    if (!validation.isValid) {
      throw new Error(`Schedule Generation Blocked: ${validation.errors.join(' ')}`);
    }

    const eveningSlots = buildEveningSlots(daysInMonth, year, month);
    const totalSeats = eveningSlots.length * 2;
    const nonExempt = nonItUsers.filter(u => !exemptEveningSet.has(u.id));

    // Dynamic Evening Quota Scaling
    const maxEveningQuota = Math.ceil(totalSeats / nonExempt.length) + 1;

    const employees: EmployeeState[] = nonItUsers.map(u => ({
      id: u.id,
      user: u,
      isExemptEvening: exemptEveningSet.has(u.id),
      schedule: new Map<number, ShiftType>(),
      lockedDays: new Map<number, ShiftType>(),
      maxEveningBlocks: exemptEveningSet.has(u.id) ? 0 : maxEveningQuota,
      assignedEveningBlocks: 0,
      targetMorningDays: 4,
      assigned12hDays: new Set<number>(),
      assigned12hWeeks: new Map<number, number>(),
      totalRenderedHours: 0,
    }));

    // STEP 1: Tile Evening Shifts (12h-e) in 2-day consecutive blocks
    const eveningSolved = solveEveningSlots(eveningSlots, employees, daysInMonth, isHoliday, isWeekend);
    if (!eveningSolved) {
      throw new Error(
        'Failed to generate evening shifts satisfying all constraints. Please verify staff distribution and exemptions.'
      );
    }

    // STEP 2: Non-Consecutive Morning Shifts (12h-m) with Exact Quotas
    const morningSolved = solveMorningShifts(employees, daysInMonth, year, month, max12hShifts);
    if (!morningSolved) {
      throw new Error(
        'Failed to generate morning shifts satisfying all constraints. Please verify staff capacity.'
      );
    }

    // STEP 3 & 4: Balance to 176h and fill residual days
    balanceTo176HoursAndFill(employees, daysInMonth, isHoliday, isWeekend);

    // STEP 5: Audit & Console Table Log
    const audit = runAudit(employees, year, month, daysInMonth, isHoliday);
    this.lastAudit = audit;

    console.log(`\n======================================================`);
    console.log(`[MonthlyScheduleGenerator] Daily Coverage Audit (${year}-${String(month + 1).padStart(2, '0')})`);
    console.log(`Status: ${audit.isValid ? 'PASSED (Zero Deficit & Strict 176h Compliance)' : 'FAILED'}`);
    console.log(`Evening Deficits: ${audit.eveningDeficitDays}, Morning Deficits: ${audit.morningDeficitDays}`);
    console.log(`Female Violations: ${audit.femaleViolations}, Male Violations: ${audit.maleViolations}, Dept Violations: ${audit.departmentViolations}`);
    console.log(`======================================================`);

    console.table(
      audit.rows.map(r => ({
        Day: r.day,
        Date: r.dateStr,
        EveningStaff: r.eveningStaff.join(', '),
        MorningStaff: r.morningStaff.join(', '),
        EMales: r.eveningMales,
        EFemales: r.eveningFemales,
        MMales: r.morningMales,
        MFemales: r.morningFemales,
        Holiday: r.isHoliday ? 'YES' : 'no',
        Status: r.status,
      }))
    );

    if (!audit.isValid) {
      throw new Error(`Schedule Audit Failed: ${audit.errors.join('; ')}`);
    }

    // Compile results
    const results: ScheduleResult[] = [];

    for (const emp of employees) {
      for (let d = 1; d <= daysInMonth; d++) {
        const shift = emp.schedule.get(d)!;
        const isH = isHoliday(d);
        const hours = calculateRenderedHours(shift, isH);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        results.push({ userId: emp.id, dateStr, shift, hours });
      }
    }

    // IT Regular Staff Rule: Mon-Fri 8h, Weekends free, Holidays holiday (8h)
    for (const itUser of itUsers) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        let shift: ShiftType;
        if (isHoliday(d)) {
          shift = 'holiday';
        } else if (isWeekend(d)) {
          shift = 'free';
        } else {
          shift = '8h';
        }
        const hours = calculateRenderedHours(shift, isHoliday(d));
        results.push({ userId: itUser.id, dateStr, shift, hours });
      }
    }

    return results;
  }
}
