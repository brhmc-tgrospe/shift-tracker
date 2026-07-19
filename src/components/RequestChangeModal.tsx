import React, { useState, useEffect } from 'react';
import { SHIFTS, DayData, ScheduleRequest, getUserRequestableShifts } from '../types';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { DatePicker } from './DatePicker';
import { ShiftDatePickerRow } from './ShiftDatePickerRow';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  dayDataMap: Record<string, DayData>;
  editRequest?: ScheduleRequest | null;
}

export function RequestChangeModal({ onClose, onSuccess, dayDataMap, editRequest }: Props) {
  const { token } = useAuth();
  const [updates, setUpdates] = useState<{ date: string; currentShift: string; requestedShift: string }[]>([
    { date: '', currentShift: 'free', requestedShift: 'off' }
  ]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (!editRequest) return;
    if (editRequest.details.updates) {
      setUpdates(editRequest.details.updates);
    } else {
      const dates = editRequest.details.dates;
      if (dates && dates.length >= 2) {
        setUpdates([{
          date: dates[0].date,
          currentShift: dates[0].shift,
          requestedShift: dates[1].shift
        }]);
      } else if (dates && dates.length === 1) {
        setUpdates([{
          date: dates[0].date,
          currentShift: 'free',
          requestedShift: dates[0].shift
        }]);
      }
    }
    setReason(editRequest.reason);
  }, [editRequest]);

  const updateRow = (i: number, field: 'date' | 'requestedShift', val: string) => {
    setUpdates(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      if (field === 'date') {
        const existing = dayDataMap[val];
        next[i].currentShift = existing?.shift || 'free';
      }
      return next;
    });
  };

  const addRow = () => {
    setUpdates(prev => [...prev, { date: '', currentShift: 'free', requestedShift: 'off' }]);
  };

  const removeRow = (i: number) => {
    setUpdates(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || updates.some(u => !u.date)) {
      toast.error('Please fill out all fields.');
      return;
    }
    setLoading(true);

    const updatesWithHours = updates.map(u => ({
      ...u,
      hours: SHIFTS[u.requestedShift as keyof typeof SHIFTS]?.defaultHours || 0
    }));

    const payload = {
      type: 'change',
      details: { updates: updatesWithHours },
      reason
    };

    try {
      const url = editRequest ? `/api/requests/${editRequest.id}` : '/api/requests';
      const method = editRequest ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(editRequest ? 'Request updated' : 'Request submitted successfully');
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg overflow-visible">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {editRequest ? 'Edit Schedule Change' : 'Request Schedule Change'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Requested Changes
            </label>
            {updates.map((u, i) => {
              const currentShiftLabel = u.currentShift ? (SHIFTS[u.currentShift as keyof typeof SHIFTS]?.label || u.currentShift) : 'No schedule';
              return (
                <div key={i} className="flex gap-2 items-start mb-2">
                  <ShiftDatePickerRow
                    date={u.date}
                    onDateChange={val => updateRow(i, 'date', val)}
                    shiftLabel={currentShiftLabel}
                  />
                  <select
                    value={u.requestedShift}
                    onChange={e => updateRow(i, 'requestedShift', e.target.value)}
                    className="w-32 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm px-3 py-2.5"
                  >
                    {getUserRequestableShifts()
                      .map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  {updates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mt-0.5"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addRow}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              + Add Date
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason for Change
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm px-3 py-2.5"
              placeholder="Explain why you need this change..."
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">This reason will be saved as a note on the schedule date.</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : editRequest ? 'Save Changes' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
