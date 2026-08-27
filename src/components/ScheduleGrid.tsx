import React, { useState } from 'react';
import { format, getDaysInMonth, startOfMonth, addDays } from 'date-fns';
import { Copy, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth, User } from '../context/AuthContext';
import { SHIFTS } from '../types';

const AVAILABLE_SHIFTS = Object.values(SHIFTS);

interface ScheduleGridProps {
  currentDate: Date;
  groupedUsers: Record<string, User[]>;
  shifts: Record<string, any>;
  pendingChanges?: Record<string, any>;
  readOnly?: boolean;
  hideSignatories?: boolean;
  hideTotalHours?: boolean;
  isLoading?: boolean;
  onCellClick?: (userId: number, dateStr: string) => void;
  onCellMouseDown?: (userId: number, dateStr: string) => void;
  onCellMouseEnter?: (userId: number, dateStr: string) => void;
  onDuplicate?: (userId: number) => void;
  enableLegendFilter?: boolean;
}

export function ScheduleGrid({
  currentDate,
  groupedUsers,
  shifts,
  pendingChanges = {},
  readOnly = false,
  hideSignatories = false,
  hideTotalHours = false,
  isLoading = false,
  onCellClick,
  onCellMouseDown,
  onCellMouseEnter,
  onDuplicate,
  enableLegendFilter = false
}: ScheduleGridProps) {
  const { user } = useAuth();
  const isAdminOrDev = user?.role === 'Admin' || user?.role === 'Developer';
  
  const [activeShiftTypes, setActiveShiftTypes] = useState<Set<string>>(
    new Set(AVAILABLE_SHIFTS.map(s => s.type))
  );

  const daysInMonth = getDaysInMonth(currentDate);
  const monthStart = startOfMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));

  return (
    <>
      <div className="flex-grow bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative select-none print:border-none print:shadow-none print:overflow-visible print:block print:h-auto print:static">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center z-10 print:hidden">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        <div className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold uppercase">
            IHOMP-IT SCHEDULE {format(currentDate, 'MMMM yyyy')}
          </h1>
        </div>

        <div className="overflow-auto max-h-full print:overflow-visible print:max-h-none print:block print:h-auto">
          <table className="w-full border-collapse text-sm print:border-none">
            <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-20 shadow-sm print:shadow-none print:bg-transparent">
              <tr>
                <th className="px-4 py-2 print:px-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 sticky left-0 z-30 min-w-[200px] print:min-w-[120px] print:text-xs print:border-none print:bg-transparent">
                  Employee
                </th>
                {days.map(day => {
                  const isWeekend = format(day, 'EEE') === 'Sun' || format(day, 'EEE') === 'Sat';
                  return (
                    <th key={day.toISOString()} className={`px-2 py-2 print:px-0 print:py-1 text-center font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 min-w-[50px] print:min-w-[25px] print:border-none print:bg-transparent ${isWeekend ? 'bg-gray-100 dark:bg-gray-800/90 print:bg-transparent' : ''}`}>
                      <div className="text-xs print:text-[10px] uppercase">{format(day, 'EEE')}</div>
                      <div className={`text-sm print:text-xs ${isWeekend ? 'text-red-500' : ''}`}>
                        {format(day, 'd')}
                      </div>
                    </th>
                  );
                })}
                {!hideTotalHours && (
                  <th className="px-4 py-2 print:hidden text-center font-bold text-gray-700 dark:text-gray-300 border-b border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 sticky right-0 z-30 min-w-[80px]">
                    Total Hrs
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(Object.entries(groupedUsers) as [string, User[]][]).sort((a, b) => {
                const order = [
                  'IT Regular',
                  'Audio/Visual and Stock Management',
                  'Technical Support',
                  'Network Management',
                  'HOMIS Support',
                  'System Development'
                ];
                const indexA = order.indexOf(a[0]);
                const indexB = order.indexOf(b[0]);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a[0].localeCompare(b[0]);
              }).map(([dept, deptUsers]) => (
                <React.Fragment key={dept}>
                  <tr className="bg-gray-100 dark:bg-gray-900/50 print:bg-gray-100">
                    <td colSpan={days.length + (hideTotalHours ? 1 : 2)} className={`px-4 py-2 print:py-1 print:px-2 print:text-xs font-semibold text-gray-700 dark:text-gray-300 sticky left-0 z-10 border-y border-gray-200 dark:border-gray-700 print:border-none print:bg-gray-100 print:text-gray-900 ${!hideTotalHours ? 'print:hidden' : ''}`}>
                      {dept}
                    </td>
                    {!hideTotalHours && (
                      <td colSpan={days.length + 1} className="px-4 py-2 print:py-1 print:px-2 print:text-xs font-semibold text-gray-700 dark:text-gray-300 sticky left-0 z-10 border-y border-gray-200 dark:border-gray-700 hidden print:table-cell print:border-none print:bg-gray-100 print:text-gray-900">
                        {dept}
                      </td>
                    )}
                  </tr>
                  {deptUsers.map(u => {
                    let totalHours = 0;

                    return (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 group print:bg-transparent">
                        <td className="px-4 py-2 print:px-1 print:py-1 border-b border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky left-0 z-10 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/30 print:border-none print:bg-transparent">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-gray-900 dark:text-white truncate print:text-xs print:w-[120px] flex items-center gap-1.5">
                              <span>{u.firstName} {u.lastName}</span>
                              {u.gender && (
                                <span className={`text-[10px] px-1 py-0.2 rounded font-semibold print:hidden ${
                                  u.gender === 'Female' 
                                    ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' 
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                }`}>
                                  {u.gender === 'Female' ? 'F' : 'M'}
                                </span>
                              )}
                            </div>
                            {!readOnly && onDuplicate && (
                              <button
                                onClick={() => onDuplicate(u.id)}
                                title="Copy schedule from previous month"
                                className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 print:hidden flex-shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        {days.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const key = `${u.id}-${dateStr}`;
                          const activeData = pendingChanges[key] || shifts[key];

                          let cellContent = '-';
                          let cellColor = '';

                          if (activeData) {
                            const shiftType = AVAILABLE_SHIFTS.find(s => s.type === activeData.shift) || SHIFTS['on-leave'];
                            if (shiftType && shiftType.type !== 'free') {
                              const isFilteredOut = enableLegendFilter && !activeShiftTypes.has(shiftType.type);
                              cellContent = shiftType.type;
                              cellColor = isFilteredOut
                                ? 'bg-gray-50/50 dark:bg-gray-800/30 text-gray-300 dark:text-gray-600 border border-dashed border-gray-200 dark:border-gray-700 opacity-50'
                                : shiftType.colorClass;
                              totalHours += (activeData.hours || shiftType.defaultHours);
                            }
                          }

                          const dayOfWeek = format(day, 'EEE');
                          const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
                          if (cellContent === '-' && isWeekend) {
                            cellContent = dayOfWeek.toUpperCase();
                          }

                          const isPending = !!pendingChanges[key];
                          const hasNotes = activeData?.notes && activeData.notes.trim() !== '';
                          const showNotesIndicator = isAdminOrDev && hasNotes;

                          return (
                            <td
                              key={dateStr}
                              className={`group/cell relative border-b border-gray-200 dark:border-gray-700 text-center p-1 print:p-0 transition-colors print:border-none ${!readOnly ? 'cursor-pointer' : ''
                                } ${isPending ? 'opacity-80 border-dashed border-2 border-indigo-400' : ''
                                } ${isWeekend && !activeData ? 'bg-gray-50 dark:bg-gray-800/80 print:bg-transparent' : ''}`}
                              onMouseDown={() => !readOnly && onCellMouseDown?.(u.id, dateStr)}
                              onMouseEnter={() => !readOnly && onCellMouseEnter?.(u.id, dateStr)}
                              onClick={() => !readOnly && onCellClick?.(u.id, dateStr)}
                            >
                              <div 
                                className={`w-full h-8 print:h-5 flex items-center justify-center rounded text-xs print:text-[9px] font-semibold relative ${cellColor || 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 print:text-gray-600'}`}
                              >
                                {cellContent}
                                {showNotesIndicator && (
                                  <>
                                    <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full print:hidden shadow-sm" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/cell:block w-max max-w-[200px] bg-gray-900 dark:bg-gray-700 text-white text-xs rounded p-2 z-[60] shadow-lg text-left whitespace-normal break-words pointer-events-none">
                                      {activeData.notes}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        {!hideTotalHours && (
                          <td className={`px-4 py-2 print:hidden border-b border-l border-gray-200 dark:border-gray-700 text-center font-bold sticky right-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/30 ${totalHours === 176 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                            }`}>
                            <div className="flex items-center justify-center gap-1">
                              {totalHours}h
                              {totalHours !== 176 && <AlertCircle className="w-4 h-4 print:hidden" title="Must be exactly 176 hours" />}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`mt-8 text-sm ${hideSignatories ? 'block' : 'hidden print:block'} print:mt-4 signatories-container`}>
        <div className="font-bold mb-2 print:text-xs">LEGEND:</div>
        <div className="flex flex-wrap gap-4 print:gap-2 mb-12 print:mb-6">
          {AVAILABLE_SHIFTS.filter(s => s.type !== 'free' && s.type !== 'N/A' && s.type !== 'on-leave' && s.type !== 'absent').map(st => {
            const isActive = activeShiftTypes.has(st.type);
            return (
              <div
                key={st.type}
                className={`flex items-center gap-2 print:gap-1 print:text-xs ${enableLegendFilter ? 'cursor-pointer hover:opacity-80 transition-opacity select-none' : ''} ${!isActive && enableLegendFilter ? 'opacity-40 grayscale' : ''}`}
                onClick={() => {
                  if (!enableLegendFilter) return;
                  setActiveShiftTypes(prev => {
                    const next = new Set(prev);
                    if (next.has(st.type)) next.delete(st.type);
                    else next.add(st.type);
                    return next;
                  });
                }}
              >
                <div className={`w-8 h-6 print:w-6 print:h-4 rounded flex items-center justify-center text-xs print:text-[9px] font-semibold ${st.colorClass.split(' ').filter(c => !c.includes('hover')).join(' ')}`}>
                  {st.type}
                </div>
                <span>- {st.label}</span>
              </div>
            );
          })}
        </div>

        {!hideSignatories && (
          <div className="flex justify-between items-end mt-16 print:mt-10 print:text-xs">
            <div>
              <div className="mb-2">Prepared by:</div>
              <div className="h-14 print:h-12" />
              <div className="border-t border-black min-w-[250px] print:min-w-[200px] pt-1 inline-block">
                <div className="font-bold">VLADIMIR M . PIANDO, MIS</div>
                <div>CMT III, Head, IHOMP-IT Office</div>
              </div>
            </div>
            <div>
              <div className="mb-2">Approved by:</div>
              <div className="h-14 print:h-12" />
              <div className="border-t border-black min-w-[350px] print:min-w-[280px] pt-1 inline-block">
                <div className="font-bold">ERIC RAYMOND N. RABORAR, MD, MPA - HEDM, MMHoA, FPS MS</div>
                <div>Medical Center Chief II</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
