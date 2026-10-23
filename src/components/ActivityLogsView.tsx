import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { Trash2, Search, Filter, ChevronLeft, ChevronRight, Code } from 'lucide-react';
import { SHIFTS } from '../types';
import toast from 'react-hot-toast';

interface ActivityLog {
  id: number;
  action: string;
  actor_id: number;
  target_user_id: number | null;
  details: Record<string, any>;
  created_at: string;
  actor_username: string;
  actor_firstName: string;
  actor_lastName: string;
  target_username: string | null;
  target_firstName: string | null;
  target_lastName: string | null;
}

export function formatLogDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }
  }
  const dateObj = new Date(dateStr);
  return isNaN(dateObj.getTime())
    ? dateStr
    : dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function formatLogMonth(monthStr: string): string {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m)) {
      const dateObj = new Date(y, m - 1, 1);
      return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  return monthStr;
}

export function formatLogShift(shiftKey: string | undefined | null): string {
  if (!shiftKey) return 'Day Off';
  const clean = String(shiftKey).trim().toLowerCase();
  if (clean === 'off' || clean === 'free') return 'Day Off';
  if (clean === '8h') return '8am-5pm';
  if (clean === '12h-m') return '12h Morning';
  if (clean === '12h-e') return '12h Evening';
  if (clean === '12h') return '12h Shift';
  if (clean === 'holiday') return 'Holiday';
  if (clean === 'on-leave') return 'On-Leave';
  if (clean === 'absent') return 'Absent';
  if (clean === 'n/a') return 'N/A';

  const def = SHIFTS[shiftKey as keyof typeof SHIFTS];
  return def?.label || shiftKey;
}

export function getShiftBadgeClass(shiftKey: string | undefined | null): string {
  const clean = String(shiftKey || '').trim().toLowerCase();
  if (clean === 'off' || clean === 'free') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800';
  }
  if (clean === '8h' || clean === '8am-5pm') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800';
  }
  if (clean === '12h-m' || clean === '12h morning') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
  }
  if (clean === '12h-e' || clean === '12h evening') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800';
  }
  if (clean === 'holiday') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 border border-orange-200 dark:border-orange-800';
  }
  if (clean === 'on-leave') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-200 dark:border-purple-800';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600';
}

function getActionBadgeClass(action: string): string {
  switch (action) {
    case 'SHIFT_UPDATED':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border border-blue-200 dark:border-blue-800';
    case 'BULK_SHIFT_UPDATE':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800';
    case 'DUPLICATE_SHIFT_UPDATE':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-200 dark:border-purple-800';
    case 'REQUEST_CREATED':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 border border-sky-200 dark:border-sky-800';
    case 'REQUEST_ACCEPTED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800';
    case 'REQUEST_DENIED':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800';
    case 'REQUEST_PARTIALLY_ACCEPTED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700';
  }
}

function getTargetDisplayName(log: ActivityLog): string {
  if (log.target_firstName) {
    return `${log.target_firstName} ${log.target_lastName || ''}`.trim();
  }
  if (log.target_username) {
    return log.target_username;
  }
  const updates = log.details?.updates || log.details?.details?.updates;
  if (Array.isArray(updates) && updates.length > 0) {
    const names = Array.from(new Set(updates.map((u: any) => u.employeeName).filter(Boolean)));
    if (names.length === 1) {
      return names[0] as string;
    }
  }
  if (log.action === 'REQUEST_CREATED' && log.details?.type === 'change' && log.actor_firstName) {
    return `${log.actor_firstName} ${log.actor_lastName || ''}`.trim();
  }
  return '-';
}

function ShiftUpdateRow({ u, showEmployee = false }: { u: any; showEmployee?: boolean; key?: React.Key }) {
  const dateStr = u.date;
  const oldShift = u.oldShift ?? u.currentShift ?? 'off';
  const newShift = u.newShift ?? u.requestedShift ?? 'off';

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm py-0.5">
      {showEmployee && u.employeeName && (
        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
          {u.employeeName} —
        </span>
      )}
      <span className="font-semibold text-gray-900 dark:text-gray-100">
        {formatLogDate(dateStr)}
      </span>
      <span className="text-gray-500 dark:text-gray-400 text-xs">from</span>
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getShiftBadgeClass(oldShift)}`}>
        {formatLogShift(oldShift)}
      </span>
      <span className="text-gray-500 dark:text-gray-400 text-xs">to</span>
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getShiftBadgeClass(newShift)}`}>
        {formatLogShift(newShift)}
      </span>
      {u.status && (
        <span
          className={`ml-1 px-1.5 py-0.2 text-[10px] uppercase font-bold rounded ${
            u.status === 'accepted'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : u.status === 'denied'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          {u.status}
        </span>
      )}
    </div>
  );
}

function ActivityLogDetailsCell({ log }: { log: ActivityLog }) {
  const [showRaw, setShowRaw] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const details = log.details || {};

  // Extract updates array from various possible structures
  let updates: any[] = [];
  if (Array.isArray(details.updates)) {
    updates = details.updates;
  } else if (details.details && Array.isArray(details.details.updates)) {
    updates = details.details.updates;
  } else if (Array.isArray(details.dates)) {
    updates = details.dates.map((d: any) => ({
      date: d.date,
      oldShift: 'off',
      newShift: d.shift,
      hours: d.hours
    }));
  } else if (details.details && Array.isArray(details.details.dates)) {
    updates = details.details.dates.map((d: any) => ({
      date: d.date,
      oldShift: 'off',
      newShift: d.shift,
      hours: d.hours
    }));
  } else if (details.date && (details.oldShift !== undefined || details.newShift !== undefined)) {
    updates = [{
      date: details.date,
      oldShift: details.oldShift,
      newShift: details.newShift,
      hours: details.hours
    }];
  }

  // Check if multiple employees exist in updates
  const uniqueEmployeeNames = Array.from(new Set(updates.map(u => u.employeeName).filter(Boolean)));
  const showEmployeeNameInRow = uniqueEmployeeNames.length > 1;

  // Determine swap details
  const isSwap = details.type === 'swap';
  const requesterDates = details.details?.requesterDates || details.requesterDates;
  const targetDates = details.details?.targetDates || details.targetDates;

  const visibleUpdates = isExpanded ? updates : updates.slice(0, 4);

  return (
    <div className="space-y-1.5 max-w-xl">
      {/* Shift updates list */}
      {updates.length > 0 && (
        <div className="space-y-1">
          {visibleUpdates.map((u, i) => (
            <ShiftUpdateRow key={i} u={u} showEmployee={showEmployeeNameInRow} />
          ))}
          {updates.length > 4 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold pt-0.5 inline-block"
            >
              {isExpanded ? 'Show less' : `+ ${updates.length - 4} more shifts`}
            </button>
          )}
        </div>
      )}

      {/* Swap request rendering */}
      {isSwap && (requesterDates || targetDates) && (
        <div className="space-y-1 text-xs sm:text-sm">
          {Array.isArray(requesterDates) && requesterDates.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Requester:</span>
              {requesterDates.map((d: any, idx: number) => (
                <span key={idx} className="inline-flex items-center gap-1">
                  <span>{formatLogDate(d.date)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getShiftBadgeClass(d.shift)}`}>
                    {formatLogShift(d.shift)}
                  </span>
                </span>
              ))}
            </div>
          )}
          {Array.isArray(targetDates) && targetDates.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Target:</span>
              {targetDates.map((d: any, idx: number) => (
                <span key={idx} className="inline-flex items-center gap-1">
                  <span>{formatLogDate(d.date)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getShiftBadgeClass(d.shift)}`}>
                    {formatLogShift(d.shift)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historical bulk shift update (when updates array is not present) */}
      {updates.length === 0 && !isSwap && details.totalUpdated !== undefined && (
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Bulk shift update: <span className="font-semibold">{details.totalUpdated}</span> shifts{' '}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({details.upsertedCount ?? 0} updated, {details.deletedCount ?? 0} cleared)
          </span>
        </div>
      )}

      {/* Duplicate month action */}
      {log.action === 'DUPLICATE_SHIFT_UPDATE' && details.sourceMonth && details.targetMonth && (
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Duplicated <span className="font-semibold">{details.duplicatedCount || 0}</span> shifts from{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{formatLogMonth(details.sourceMonth)}</span> to{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{formatLogMonth(details.targetMonth)}</span>
        </div>
      )}

      {/* Request status info */}
      {details.requestId && (
        <div className="flex items-center gap-2 pt-0.5 flex-wrap">
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
            Request #{details.requestId}
          </span>
          {details.admin_status && (
            <span
              className={`text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                details.admin_status === 'accepted'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : details.admin_status === 'denied'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {details.admin_status === 'partially_accepted' ? 'Partially Approved' : details.admin_status}
            </span>
          )}
          {details.acceptedCount !== undefined && details.deniedCount !== undefined && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({details.acceptedCount} approved, {details.deniedCount} denied)
            </span>
          )}
        </div>
      )}

      {/* Request reason */}
      {details.reason && (
        <div className="text-xs text-gray-600 dark:text-gray-300 italic bg-gray-50 dark:bg-gray-900/60 p-2 rounded border border-gray-200/80 dark:border-gray-700/80 mt-1">
          <span className="font-semibold not-italic text-gray-700 dark:text-gray-300">Reason:</span> "{details.reason}"
        </div>
      )}

      {/* Admin remark */}
      {details.remark && (
        <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-800 mt-1">
          <span className="font-semibold">Remark:</span> {details.remark}
        </div>
      )}

      {/* Toggle raw JSON view */}
      <div className="pt-1 flex items-center">
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 font-mono transition-colors"
        >
          <Code className="w-3 h-3" />
          {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
      </div>

      {showRaw && (
        <pre className="mt-1 text-[11px] whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded-md border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ActivityLogsView() {
  const { token, user } = useAuth();
  const modal = useModal();
  
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [error, setError] = useState('');
  
  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Search debounce
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Purge Modal state
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeStart, setPurgeStart] = useState('');
  const [purgeEnd, setPurgeEnd] = useState('');

  // Handle Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on search change
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Handle other filter changes
  useEffect(() => {
    setPage(1);
  }, [actionFilter, startDate, endDate, limit]);

  useEffect(() => {
    fetchLogs();
  }, [page, limit, debouncedSearch, actionFilter, startDate, endDate]);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (actionFilter) params.append('action', actionFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/activity-logs?${params.toString()}`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      
      if (!res.ok) throw new Error('Failed to fetch logs');
      
      const { data, total } = await res.json();
      setLogs(data);
      setTotalLogs(total);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePurge = async () => {
    if (!purgeStart || !purgeEnd) {
      toast.error('Please select both a start and end date');
      return;
    }
    
    if (new Date(purgeStart) > new Date(purgeEnd)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    if (!(await modal.confirm(`Are you sure you want to permanently delete logs from ${purgeStart} to ${purgeEnd}?`))) {
      return;
    }

    try {
      const res = await fetch('/api/activity-logs/purge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ startDate: purgeStart, endDate: purgeEnd })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      toast.success('Logs purged successfully');
      setShowPurgeModal(false);
      setPurgeStart('');
      setPurgeEnd('');
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (user?.role !== 'Developer') {
    return <div className="p-4 sm:p-6 lg:p-8">Access Denied</div>;
  }

  const totalPages = Math.ceil(totalLogs / limit) || 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 border border-red-100 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Header and Purge Button */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Activity Logs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review system activities and manage log retention.</p>
        </div>
        
        <button
          onClick={() => setShowPurgeModal(true)}
          className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
        >
          <Trash2 className="w-4 h-4" /> Purge Logs
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-white transition-colors"
            />
          </div>

          {/* Action Filter */}
          <div className="relative w-full sm:w-auto">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="appearance-none block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:text-white transition-colors cursor-pointer"
            >
              <option value="">All Actions</option>
              <option value="SHIFT_UPDATED">SHIFT_UPDATED</option>
              <option value="BULK_SHIFT_UPDATE">BULK_SHIFT_UPDATE</option>
              <option value="DUPLICATE_SHIFT_UPDATE">DUPLICATE_SHIFT_UPDATE</option>
              <option value="REQUEST_CREATED">REQUEST_CREATED</option>
              <option value="REQUEST_ACCEPTED">REQUEST_ACCEPTED</option>
              <option value="REQUEST_DENIED">REQUEST_DENIED</option>
              <option value="REQUEST_PARTIALLY_ACCEPTED">REQUEST_PARTIALLY_ACCEPTED</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-gray-400" />
            </div>
          </div>

          {/* Date Filters */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 rounded-lg outline-none transition-colors dark:text-white text-sm"
              title="Start Date (Filter)"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 rounded-lg outline-none transition-colors dark:text-white text-sm"
              title="End Date (Filter)"
            />
          </div>
        </div>
        
        {/* Rows Per Page */}
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Show</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>entries</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-4 font-semibold rounded-full ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                      {log.actor_firstName} {log.actor_lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {getTargetDisplayName(log)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <ActivityLogDetailsCell log={log} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="bg-white dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between sm:px-6">
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing <span className="font-medium">{logs.length > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium">{Math.min(page * limit, totalLogs)}</span> of <span className="font-medium">{totalLogs}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Purge Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 dark:bg-gray-900 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative z-10 inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-200 dark:border-gray-700">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/50 sm:mx-0 sm:h-10 sm:w-10">
                    <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                      Purge Activity Logs
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Select a date range to permanently delete old activity logs. This action cannot be undone.
                      </p>
                      
                      <div className="flex flex-col gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={purgeStart}
                            onChange={(e) => setPurgeStart(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                          <input
                            type="date"
                            value={purgeEnd}
                            onChange={(e) => setPurgeEnd(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handlePurge}
                  disabled={!purgeStart || !purgeEnd}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Purge Logs
                </button>
                <button
                  type="button"
                  onClick={() => setShowPurgeModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
