import { ShiftType } from '../types';

export interface ScheduleResult {
  userId: number;
  dateStr: string;
  shift: ShiftType;
  hours: number;
}

/**
 * MonthlyScheduleGenerator
 * Follows DDD principles by separating domain logic from UI.
 */
export class MonthlyScheduleGenerator {

  static generate(
    users: any[],
    year: number,
    month: number // 0-indexed
  ): ScheduleResult[] {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const maxRetries = 2000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const schedule = this.attemptGeneration(users, year, month, daysInMonth);
        if (schedule) {
          return schedule;
        }
      } catch (e) {
        // Failed, retry next loop
      }
    }

    throw new Error("Failed to generate a valid schedule satisfying all constraints. Please check if there are enough staff.");
  }

  private static generateBlockStarts(daysInMonth: number): number[] {
    for (let iter = 0; iter < 100000; iter++) {
      let x = Array(daysInMonth + 1).fill(0);
      for (let d = 1; d < daysInMonth; d++) {
        let prev = x[d - 1];
        let minN = Math.max(0, 2 - prev);
        let maxN = 3 - prev; // max 3 people per day on a shift type
        if (d === daysInMonth - 1) {
          minN = Math.max(minN, 2);
        }
        if (minN > maxN) break;
        x[d] = minN + Math.floor(Math.random() * (maxN - minN + 1));
      }
      x[daysInMonth] = 0; // blocks must not spill over to next month
      
      let valid = true;
      for (let d = 1; d <= daysInMonth; d++) {
        let sum = x[d] + x[d - 1];
        if (sum < 2 || sum > 3) { valid = false; break; }
      }
      if (valid) return x;
    }
    throw new Error('Could not find block sequence');
  }

  private static attemptGeneration(users: any[], year: number, month: number, daysInMonth: number): ScheduleResult[] | null {
    if (users.length < 14) {
      throw new Error(`Mathematically impossible to satisfy constraints with only ${users.length} staff.`);
    }

    const starts_m = this.generateBlockStarts(daysInMonth);
    const starts_e = this.generateBlockStarts(daysInMonth);
    
    const total_m = starts_m.reduce((a,b)=>a+b,0);
    const total_e = starts_e.reduce((a,b)=>a+b,0);
    
    const userStates = users.map(u => ({
      id: u.id,
      blocks_m: 1,
      blocks_e: 1,
      shifts_8: 16,
      schedule: Array(daysInMonth + 1).fill(null) as (ShiftType | null)[]
    }));
    
    let extra_m = total_m - users.length;
    let extra_e = total_e - users.length;
    let uIndex = 0;
    while (extra_m > 0) {
      userStates[uIndex % users.length].blocks_m++;
      userStates[uIndex % users.length].shifts_8 -= 3;
      extra_m--;
      uIndex++;
    }
    while (extra_e > 0) {
      userStates[uIndex % users.length].blocks_e++;
      userStates[uIndex % users.length].shifts_8 -= 3;
      extra_e--;
      uIndex++;
    }
    
    function getWeekday(day: number) { 
      return new Date(year, month, day).getDay(); 
    }
    function isWeekend(day: number) { 
      let wd = getWeekday(day); 
      return wd === 0 || wd === 6; 
    }
    
    const assignBlocks = (type: '12h-m' | '12h-e') => {
      let starts = type === '12h-m' ? starts_m : starts_e;
      let schedulePlan: number[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        for (let k = 0; k < starts[d]; k++) schedulePlan.push(d);
      }
      
      const bt = (index: number): boolean => {
        if (index === schedulePlan.length) return true;
        let d = schedulePlan[index];
        
        let candidateUsers = [...userStates].sort(() => Math.random() - 0.5);
        candidateUsers.sort((a,b) => (type === '12h-m' ? b.blocks_m - a.blocks_m : b.blocks_e - a.blocks_e));
        
        for (let u of candidateUsers) {
          let blocks = type === '12h-m' ? u.blocks_m : u.blocks_e;
          if (blocks > 0 && u.schedule[d] === null && u.schedule[d+1] === null) {
            
            if (type === '12h-e' && d + 2 <= daysInMonth && u.schedule[d+2] !== null) continue;
            
            if (type === '12h-m') {
              if (d > 1 && (u.schedule[d-1] === '12h-m' || u.schedule[d-1] === '12h-e')) continue;
              if (d + 2 <= daysInMonth && (u.schedule[d+2] === '12h-m' || u.schedule[d+2] === '12h-e')) continue;
            }
  
            if (type === '12h-m') u.blocks_m--; else u.blocks_e--;
            u.schedule[d] = type;
            u.schedule[d+1] = type;
            let originalD2 = null;
            if (type === '12h-e' && d + 2 <= daysInMonth) {
              originalD2 = u.schedule[d+2];
              u.schedule[d+2] = isWeekend(d+2) ? 'free' : 'off';
            }
  
            if (bt(index + 1)) return true;
  
            if (type === '12h-m') u.blocks_m++; else u.blocks_e++;
            u.schedule[d] = null;
            u.schedule[d+1] = null;
            if (type === '12h-e' && d + 2 <= daysInMonth) {
              u.schedule[d+2] = originalD2;
            }
          }
        }
        return false;
      };
      
      if (!bt(0)) throw new Error('Failed to assign ' + type);
    };
    
    assignBlocks('12h-e');
    assignBlocks('12h-m');
    
    for (let u of userStates) {
      while (u.shifts_8 > 0) {
        let found = false;
        let days = Array.from({length: daysInMonth}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
        for (let d of days) {
          if (u.schedule[d] === null && !isWeekend(d)) {
            u.schedule[d] = '8h';
            u.shifts_8--;
            found = true;
            break;
          }
        }
        if (!found) return null; // Dead end, retry
      }
    }
    
    for (let u of userStates) {
      for (let d = 1; d <= daysInMonth; d++) {
        if (u.schedule[d] === null) {
          u.schedule[d] = isWeekend(d) ? 'free' : 'off';
        }
      }
    }
    
    const results: ScheduleResult[] = [];
    for (const u of userStates) {
      for (let d = 1; d <= daysInMonth; d++) {
        let shift = u.schedule[d]!;
        let hours = 0;
        if (shift === '12h-m' || shift === '12h-e') hours = 12;
        else if (shift === '8h') hours = 8;
        
        results.push({
          userId: u.id,
          dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          shift,
          hours
        });
      }
    }
    
    return results;
  }
}
