import React, { useState } from 'react';
import { getDaysInMonth, getFirstDayOfMonth, formatYYYYMMDD, DAY_NAMES, MONTH_NAMES } from '../utils/date';
import { DayData, SHIFTS } from '../types';
import { ShiftModal } from './ShiftModal';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageSquare } from 'lucide-react';

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
  allowNotesEdit?: boolean;
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
  readOnly = false,
  allowNotesEdit = false
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
        
        <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center min-w-0 mx-1 sm:mx-2">
          <select 
            value={currentMonth}
            onChange={(e) => onChangeMonth(Number(e.target.value))}
            className="text-base sm:text-xl font-bold text-gray-900 dark:text-white bg-transparent outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md p-1 pr-1 sm:pr-6"
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={index} value={index}>{name}</option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            className="text-base sm:text-xl font-bold text-gray-900 dark:text-white bg-transparent outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md p-1 pr-1 sm:pr-6"
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
            let displayHours = data ? data.hours : 0;
            if (data && displayHours === 0 && data.shift !== 'free' && data.shift !== 'off' && data.shift !== 'holiday' && data.shift !== 'N/A') {
              displayHours = SHIFTS[data.shift]?.defaultHours || 0;
            }
            if (data && data.shift === 'on-leave') {
              displayHours = Math.max(displayHours, 8);
            }
            
            return (
              <button
                key={day}
                onClick={() => { if (!readOnly || allowNotesEdit) setSelectedDate(dateStr); }}
                className={`group relative aspect-square flex flex-col items-center justify-center rounded-xl border transition-all duration-200 ${(!readOnly || allowNotesEdit) ? 'hover:scale-[1.02] active:scale-95 cursor-pointer' : 'cursor-default opacity-90'} ${shiftDef.colorClass}`}
              >
                <span className="text-sm sm:text-base font-medium leading-none">{day}</span>
                {displayHours > 0 && (
                  <span className="text-[9px] sm:text-[10px] font-bold opacity-70 mt-0.5 sm:mt-1 leading-none">
                    {displayHours}h
                  </span>
                )}
                {data?.notes && (
                  <>
                    <MessageSquare className="absolute top-1.5 left-1.5 w-3.5 h-3.5 opacity-60" />
                    <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 bottom-[calc(100%+8px)] w-48 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-xs text-left rounded-lg p-2 shadow-xl transition-all duration-200 pointer-events-none break-words">
                      {data.notes}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100"></div>
                    </div>
                  </>
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
          notesOnly={readOnly && allowNotesEdit}
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
