import React, { useState, useEffect, useRef } from 'react';
import { SHIFTS, ScheduleRequest, DayData } from '../types';
import { X, ArrowRightLeft, Search, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, User } from '../context/AuthContext';
import { DatePicker } from './DatePicker';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  dayDataMap: Record<string, DayData>;
  editRequest?: ScheduleRequest | null;
}

export function SwapScheduleModal({ onClose, onSuccess, dayDataMap, editRequest }: Props) {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [targetUserId, setTargetUserId] = useState<number | ''>('');
  
  const [myDates, setMyDates] = useState<{ date: string; shift: string }[]>([{ date: '', shift: 'free' }]);
  const [targetDates, setTargetDates] = useState<{ date: string; shift: string }[]>([{ date: '', shift: 'free' }]);
  
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [targetDayDataMap, setTargetDayDataMap] = useState<Record<string, DayData>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsers = users.filter(u => 
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sync search query when targetUserId changes
  useEffect(() => {
    if (targetUserId && users.length > 0) {
      const u = users.find(u => u.id === targetUserId);
      if (u) {
        setSearchQuery(`${u.firstName} ${u.lastName}`);
      }
    }
  }, [targetUserId, users]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users/public', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.filter((u: User) => u.id !== currentUser?.id));
        }
      } catch (e) {
        console.error('Failed to fetch users', e);
      }
    };
    fetchUsers();
  }, [token, currentUser?.id]);

  useEffect(() => {
    const fetchTargetSchedule = async () => {
      if (!targetUserId) {
        setTargetDayDataMap({});
        return;
      }
      try {
        const res = await fetch(`/api/users/${targetUserId}/shifts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTargetDayDataMap(data);
        }
      } catch (e) {
        console.error('Failed to fetch target user shifts', e);
      }
    };
    fetchTargetSchedule();
  }, [targetUserId, token]);

  // Pre-fill when editing
  useEffect(() => {
    if (!editRequest) return;
    if (editRequest.target_user_id) setTargetUserId(editRequest.target_user_id);
    if (editRequest.details.requesterDates) setMyDates(editRequest.details.requesterDates.map(d => ({ date: d.date, shift: d.shift })));
    if (editRequest.details.targetDates) setTargetDates(editRequest.details.targetDates.map(d => ({ date: d.date, shift: d.shift })));
    setReason(editRequest.reason);
  }, [editRequest]);

  // Auto-sync lengths of targetDates to match myDates
  useEffect(() => {
    setTargetDates(prev => {
      if (myDates.length > prev.length) {
        return [...prev, ...Array.from({ length: myDates.length - prev.length }).map(() => ({ date: '', shift: 'free' }))];
      } else if (myDates.length < prev.length) {
        return prev.slice(0, myDates.length);
      }
      return prev;
    });
  }, [myDates.length]);

  const updateMyDate = (i: number, field: 'date' | 'shift', val: string) => {
    setMyDates(prev => {
      const next = prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d);
      if (field === 'date') {
        const existing = dayDataMap[val];
        next[i].shift = existing?.shift || 'free';
      }
      return next;
    });
  };
  
  const updateTargetDate = (i: number, field: 'date' | 'shift', val: string) => {
    setTargetDates(prev => {
      const next = prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d);
      if (field === 'date') {
        const existing = targetDayDataMap[val];
        next[i].shift = existing?.shift || 'free';
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !targetUserId || myDates.some(d => !d.date) || targetDates.some(d => !d.date)) {
      toast.error('Please fill out all dates, select a target user, and provide a reason.');
      return;
    }
    if (myDates.length !== targetDates.length) {
      toast.error('Number of dates to swap must be equal.');
      return;
    }

    if (myDates.some(d => d.shift === 'absent' || d.shift === 'N/A') || targetDates.some(d => d.shift === 'absent' || d.shift === 'N/A')) {
      toast.error('You cannot swap Absent or N/A shifts.');
      return;
    }

    setLoading(true);
    const requesterDatesWithHours = myDates.map(d => ({ ...d, hours: SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours || 0 }));
    const targetDatesWithHours = targetDates.map(d => ({ ...d, hours: SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours || 0 }));

    const payload = {
      type: 'swap',
      target_user_id: targetUserId,
      details: { requesterDates: requesterDatesWithHours, targetDates: targetDatesWithHours },
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
        toast.success(editRequest ? 'Request updated' : 'Swap request submitted successfully');
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to submit swap request');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit swap request');
    } finally {
      setLoading(false);
    }
  };

  const renderGiveRow = () => (
    <>
      {myDates.map((d, i) => {
        const shiftLabel = d.shift ? (SHIFTS[d.shift as keyof typeof SHIFTS]?.label || d.shift) : 'No schedule';
        return (
          <div key={`give-${i}`} className="flex gap-2 mb-2 items-start">
            <DatePicker
              value={d.date}
              onChange={val => updateMyDate(i, 'date', val)}
              placeholder="Select date"
              required
              className="flex-1"
            />
            <div className="w-28 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300 truncate">
              {d.date ? shiftLabel : 'Pick date'}
            </div>
            {myDates.length > 1 && (
              <button type="button" onClick={() => setMyDates(myDates.filter((_, idx) => idx !== i))} className="text-red-500 p-1 mt-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setMyDates([...myDates, { date: '', shift: 'free' }])}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1"
      >
        + Add Date
      </button>
    </>
  );

  const renderReceiveRow = () => (
    <>
      {targetDates.map((d, i) => {
        const shiftLabel = d.shift ? (SHIFTS[d.shift as keyof typeof SHIFTS]?.label || d.shift) : 'No schedule';
        return (
          <div key={`receive-${i}`} className="flex gap-2 mb-2 items-start">
            <DatePicker
              value={d.date}
              onChange={val => updateTargetDate(i, 'date', val)}
              placeholder="Select date"
              required
              className="flex-1"
            />
            <div className="w-28 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-300 truncate">
              {d.date ? shiftLabel : 'Pick date'}
            </div>
            {/* Missing delete button is intentional, targets length follows give length */}
            <div className="w-6 hidden md:block"></div>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl overflow-visible max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
            {editRequest ? 'Edit Schedule Swap' : 'Request Schedule Swap'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Swap With User
            </label>
            <div className="relative" ref={dropdownRef}>
              <div 
                className={`flex items-center w-full rounded-lg border border-gray-300 shadow-sm px-3 py-2.5 ${editRequest ? 'opacity-60 bg-gray-50 dark:bg-gray-800 cursor-not-allowed dark:border-gray-600' : 'cursor-text bg-white dark:bg-gray-700 dark:border-gray-600'}`}
                onClick={() => !editRequest && setDropdownOpen(true)}
              >
                <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search or select user..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setDropdownOpen(true);
                    if (!e.target.value) setTargetUserId(''); // Clear selection if erased
                  }}
                  onFocus={() => !editRequest && setDropdownOpen(true)}
                  disabled={!!editRequest}
                  className="bg-transparent border-none outline-none w-full p-0 text-sm focus:ring-0 dark:text-white"
                />
                <ChevronDown className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
              </div>

              {dropdownOpen && !editRequest && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">No users found</div>
                  ) : (
                    filteredUsers.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                        onClick={() => {
                          setTargetUserId(u.id);
                          setSearchQuery(`${u.firstName} ${u.lastName}`);
                          setDropdownOpen(false);
                        }}
                      >
                        {u.firstName} {u.lastName}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">Dates You Will Give</h3>
              {renderGiveRow()}
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/50">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">Dates You Will Receive</h3>
              {renderReceiveRow()}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason for Swap
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm px-3 py-2.5"
              placeholder="Explain why you need this swap..."
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">This reason will be saved as a note on the scheduled dates.</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : editRequest ? 'Save Changes' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
