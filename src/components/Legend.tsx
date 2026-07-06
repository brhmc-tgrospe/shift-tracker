import React from 'react';
import { SHIFTS } from '../types';

export function Legend() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 transition-colors">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Shift Legend</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.values(SHIFTS)
          .filter(shift => shift.type !== 'N/A')
          .map(shift => (
          <div key={shift.type} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${shift.colorClass}`}>
              {shift.type !== 'free' && shift.type !== 'off' && (
                <span className="text-[10px] font-bold opacity-70">{shift.defaultHours}</span>
              )}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{shift.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
