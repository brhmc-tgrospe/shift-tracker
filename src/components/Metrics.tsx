import React, { useMemo } from 'react';
import { DayData, SHIFTS, ShiftType } from '../types';
import { MONTH_NAMES } from '../utils/date';
import { Clock, Calendar as CalendarIcon, Briefcase, Activity } from 'lucide-react';

interface MetricsProps {
  currentYear: number;
  currentMonth: number;
  dayDataMap: Record<string, DayData>;
}

export function Metrics({ currentYear, currentMonth, dayDataMap }: MetricsProps) {
  
  const stats = useMemo(() => {
    let monthHours = 0;
    let yearHours = 0;
    const shiftCounts = Object.keys(SHIFTS).reduce((acc, key) => {
      acc[key as ShiftType] = 0;
      return acc;
    }, {} as Record<ShiftType, number>);

    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const yearPrefix = `${currentYear}-`;

    Object.values(dayDataMap).forEach(data => {
      // For retroactivity, ensure on-leave counts as at least 8 hours
      const hoursToAdd = data.shift === 'on-leave' ? Math.max(data.hours, 8) : data.hours;

      // Year calculation
      if (data.date.startsWith(yearPrefix)) {
        yearHours += hoursToAdd;
      }
      
      // Month calculation
      if (data.date.startsWith(monthPrefix)) {
        monthHours += hoursToAdd;
        if (data.shift !== 'free') {
          shiftCounts[data.shift]++;
        }
      }
    });

    return { monthHours, yearHours, shiftCounts };
  }, [currentYear, currentMonth, dayDataMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-600 dark:bg-blue-900/50 rounded-2xl shadow-sm border border-blue-700 dark:border-blue-800 p-5 text-white transition-colors">
          <div className="flex items-center gap-3 mb-2 opacity-80 dark:opacity-90">
            <Clock className="w-5 h-5 text-blue-100" />
            <h3 className="text-sm font-medium uppercase tracking-wider text-blue-50">
              {MONTH_NAMES[currentMonth]} Hours
            </h3>
          </div>
          <div className="text-4xl font-bold text-white">
            {stats.monthHours}
            <span className="text-xl opacity-80 dark:opacity-70 font-normal ml-1">hrs</span>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 transition-colors">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <CalendarIcon className="w-5 h-5" />
            <h3 className="text-sm font-medium uppercase tracking-wider">{currentYear} Total Hours</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white">{stats.yearHours}<span className="text-xl text-gray-400 dark:text-gray-500 font-normal ml-1">hrs</span></div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 transition-colors">
        <div className="flex items-center gap-3 mb-4 text-gray-500 dark:text-gray-400">
          <Activity className="w-5 h-5" />
          <h3 className="text-sm font-medium uppercase tracking-wider">{MONTH_NAMES[currentMonth]} Breakdown</h3>
        </div>
        
        <div className="space-y-3">
          {(Object.entries(stats.shiftCounts) as [ShiftType, number][])
            .filter(([type, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${SHIFTS[type].colorClass} border-none`}></div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{SHIFTS[type].label}</span>
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {count} {count === 1 ? 'day' : 'days'}
                </div>
              </div>
          ))}
          
          {Object.values(stats.shiftCounts).every(count => count === 0) && (
            <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-xl">
              No shifts recorded for {MONTH_NAMES[currentMonth]}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
