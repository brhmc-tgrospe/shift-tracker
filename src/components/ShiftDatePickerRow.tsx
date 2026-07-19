import React from 'react';
import { DatePicker } from './DatePicker';

interface ShiftDatePickerRowProps {
  date: string;
  onDateChange: (val: string) => void;
  shiftLabel: string;
}

export function ShiftDatePickerRow({ date, onDateChange, shiftLabel }: ShiftDatePickerRowProps) {
  return (
    <>
      <DatePicker
        value={date}
        onChange={onDateChange}
        placeholder="Select date"
        required
        className="flex-1"
      />
      <div className="w-28 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300 truncate">
        {date ? shiftLabel : 'Pick date'}
      </div>
    </>
  );
}
