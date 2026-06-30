import React, { useState } from 'react';
import { getDaysInMonth, getFirstDayOfMonth, formatYYYYMMDD, DAY_NAMES, MONTH_NAMES } from '../utils/date';
import { DayData, SHIFTS } from '../types';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface CalendarProps {
  currentYear: number;
  currentMonth: number;
  onChangeMonth: (month: number) => void;
  onChangeYear: (year: number) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  dayDataMap: Record<string, DayData>;
  onUpdateDay: (data: DayData) => void;
  readOnly?: boolean;
}

export function Calendar({
  currentYear,
  currentMonth,
  onChangeMonth,
  onChangeYear,
  onPrevMonth,
  onNextMonth,
  onPrevYear,
  onNextYear,
  dayDataMap,
  onUpdateDay,
  readOnly = false
}: CalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getFirstDayOfMonth(currentYear, currentMonth);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
  
  const totalCells = blanks.length + days.length;
  // Ensure the grid always has at least 5 rows (35 cells) and fills the last row completely
  const totalGridCells = Math.max(35, Math.ceil(totalCells / 7) * 7);
  const trailingBlanks = Array.from({ length: totalGridCells - totalCells }, (_, i) => i);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-1">
          <button onClick={onPrevYear} className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Previous Year">
            <ChevronsLeft className="w-5 h-5" />
          </button>
          <button onClick={onPrevMonth} className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Previous Month">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 min-w-[200px] justify-center">
          <select 
            value={currentMonth}
            onChange={(e) => onChangeMonth(Number(e.target.value))}
            className="text-xl font-bold text-gray-900 dark:text-white bg-transparent outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md p-1 pr-6"
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={index} value={index}>{name}</option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            className="text-xl font-bold text-gray-900 dark:text-white bg-transparent outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md p-1 pr-6"
          >
            {Array.from({ length: 25 }, (_, i) => 2026 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-1">
          <button onClick={onNextMonth} className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Next Month">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={onNextYear} className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Next Year">
            <ChevronsRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DAY_NAMES.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-2">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="aspect-square opacity-0"></div>
          ))}
          
          {days.map(day => {
            const dateStr = formatYYYYMMDD(currentYear, currentMonth, day);
            const data = dayDataMap[dateStr];
            const shiftDef = data ? SHIFTS[data.shift] : SHIFTS['free'];
            const displayHours = data ? (data.shift === 'on-leave' ? Math.max(data.hours, 8) : data.hours) : 0;
            
            return (
              <button
                key={day}
                onClick={() => { if (!readOnly) setSelectedDate(dateStr); }}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl border transition-all duration-200 ${!readOnly ? 'hover:scale-[1.02] active:scale-95' : 'cursor-default opacity-90'} ${shiftDef.colorClass}`}
              >
                <span className="text-base font-medium">{day}</span>
                {displayHours > 0 && (
                  <span className="absolute bottom-1 right-1.5 text-[10px] font-bold opacity-70">
                    {displayHours}h
                  </span>
                )}
              </button>
            );
          })}
          
          {trailingBlanks.map(blank => (
            <div key={`trailing-${blank}`} className="aspect-square opacity-0 pointer-events-none"></div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selectedDate && (
        <ShiftModal
          date={selectedDate}
          initialData={dayDataMap[selectedDate]}
          onSave={(data) => {
            onUpdateDay(data);
            setSelectedDate(null);
          }}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
