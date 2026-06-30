import React, { useState, useEffect } from 'react';
import { ShiftType, SHIFTS, DayData } from '../types';

interface ShiftModalProps {
  date: string;
  initialData?: DayData;
  onSave: (data: DayData) => void;
  onClose: () => void;
}

export function ShiftModal({ date, initialData, onSave, onClose }: ShiftModalProps) {
  const [shift, setShift] = useState<ShiftType>(initialData?.shift || 'free');
  const [hours, setHours] = useState<number | ''>(initialData?.hours ?? 0);

  // When shift type changes, automatically save
  const handleShiftChange = (newShift: ShiftType) => {
    const newHours = SHIFTS[newShift].defaultHours;
    onSave({
      date,
      shift: newShift,
      hours: typeof newHours === 'number' ? newHours : 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Shift Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(SHIFTS) as [ShiftType, typeof SHIFTS[ShiftType]][])
                .map(([key, def]) => (
                <button
                  key={key}
                  onClick={() => handleShiftChange(key)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                    shift === key 
                      ? `ring-2 ring-offset-1 dark:ring-offset-gray-800 ring-blue-500 ${def.colorClass}` 
                      : `bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700`
                  }`}
                >
                  {def.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
