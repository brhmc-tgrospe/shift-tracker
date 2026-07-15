import React, { useState, useEffect } from 'react';
import { ShiftType, SHIFTS, DayData } from '../types';

interface ShiftModalProps {
  date: string;
  initialData?: DayData;
  notesOnly?: boolean;
  onSave: (data: DayData) => void;
  onClose: () => void;
}

export function ShiftModal({ date, initialData, notesOnly, onSave, onClose }: ShiftModalProps) {
  const [shift, setShift] = useState<ShiftType>(initialData?.shift || 'free');
  const [hours, setHours] = useState<number | ''>(initialData?.hours ?? 0);
  const [notes, setNotes] = useState<string>(initialData?.notes || '');

  const handleShiftChange = (newShift: ShiftType) => {
    const newHours = SHIFTS[newShift].defaultHours;
    setShift(newShift);
    setHours(newHours);
    
    if (newShift === 'free') {
      onSave({
        date,
        shift: newShift,
        hours: typeof newHours === 'number' ? newHours : 0,
        notes: ''
      });
    }
  };

  const handleSave = () => {
    onSave({
      date,
      shift,
      hours: typeof hours === 'number' ? hours : 0,
      notes: notes.trim()
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
            {notesOnly ? (
              <div className={`px-3 py-2 text-sm rounded-lg border font-medium ${SHIFTS[shift].colorClass} opacity-80 cursor-not-allowed`}>
                {SHIFTS[shift].label}
              </div>
            ) : (
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
            )}
          </div>
          
          {(notesOnly || shift !== 'free') && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors"
                rows={3}
              />
            </div>
          )}
        </div>

        {(notesOnly || shift !== 'free') && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end gap-2 animate-in fade-in duration-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
