import React from 'react';
import { Search } from 'lucide-react';

interface RequestFiltersProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  dateFilterType: 'created' | 'shift';
  onDateFilterTypeChange: (val: 'created' | 'shift') => void;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
}

export function RequestFilters({
  searchTerm,
  onSearchChange,
  dateFilterType,
  onDateFilterTypeChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange
}: RequestFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col sm:flex-row gap-4 items-end">
      <div className="flex-1 w-full relative">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or reason..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
          />
        </div>
      </div>
      
      <div className="w-full sm:w-auto">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Date Type</label>
        <select
          value={dateFilterType}
          onChange={(e) => onDateFilterTypeChange(e.target.value as 'created' | 'shift')}
          className="w-full sm:w-40 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
        >
          <option value="created">Created Date</option>
          <option value="shift">Shift Date</option>
        </select>
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="w-full sm:w-36 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
        />
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="w-full sm:w-36 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
        />
      </div>
    </div>
  );
}
