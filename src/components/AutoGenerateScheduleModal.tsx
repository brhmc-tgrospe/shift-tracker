import React, { useState } from 'react';
import { User } from '../context/AuthContext';
import { X, Paintbrush, Moon, Sun, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AutoGenerateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (exemptEveningUserIds: number[]) => void;
  nonItUsers: User[];
  monthName: string;
}

export function AutoGenerateScheduleModal({
  isOpen,
  onClose,
  onGenerate,
  nonItUsers,
  monthName
}: AutoGenerateScheduleModalProps) {
  const [exemptIds, setExemptIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const toggleExempt = (userId: number) => {
    setExemptIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const filteredUsers = nonItUsers.filter(u => {
    const query = search.toLowerCase();
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const dept = (u.department_name || '').toLowerCase();
    return fullName.includes(query) || dept.includes(query) || u.username.toLowerCase().includes(query);
  });

  const handleConfirm = () => {
    onGenerate(Array.from(exemptIds));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Auto-Generate Monthly Schedule
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Target Month: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{monthName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Guidelines Banner */}
          <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-indigo-700 dark:text-indigo-300">
              <Info className="w-4 h-4" />
              Automated Constraints & Rules
            </div>
            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300">
              <li><strong>Shift Coverage</strong>: Exactly 2 staff for 12h Morning and 2 staff for 12h Evening each day.</li>
              <li><strong>Department Diversity</strong>: Paired staff in any 12h shift slot must be from different departments.</li>
              <li><strong>Gender Balance</strong>: Paired staff cannot both be female (at least one Male per slot).</li>
              <li><strong>Consecutive Blocks & Rest</strong>: All 12h shifts are in 2-day consecutive blocks; evening shifts are followed by a mandatory day off.</li>
              <li><strong>176 Monthly Hours</strong>: Balances weekdays with 8-hour shifts to reach exactly 176 hours per employee.</li>
              <li><strong>Philippine Holidays</strong>: Automatically integrated and treated as non-working holidays with weekend 12h coverage.</li>
            </ul>
          </div>

          {/* Evening Shift Exemption Section */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Moon className="w-4 h-4 text-blue-500" />
                  12-Hour Evening Shift Exemptions
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select employees who are granted an exemption from 12-hour evening shifts for this month.
                </p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 self-start sm:self-auto">
                {exemptIds.size} exempt
              </span>
            </div>

            <input
              type="text"
              placeholder="Filter employees by name or department..."
              className="w-full px-3.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-700/60 dark:text-white"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700/60 max-h-56 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/30">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                  No matching non-IT employees found.
                </div>
              ) : (
                filteredUsers.map(u => {
                  const isChecked = exemptIds.has(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center justify-between p-3 cursor-pointer hover:bg-white dark:hover:bg-gray-800 transition-colors ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleExempt(u.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {u.firstName} {u.lastName}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {u.department_name || 'No Department'} • <span className="capitalize">{u.gender || 'Male'}</span>
                          </div>
                        </div>
                      </div>
                      {isChecked && (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
                          No Evening Shifts
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition-all"
          >
            <Paintbrush className="w-4 h-4" />
            Generate Schedule
          </button>
        </div>
      </motion.div>
    </div>
  );
}
