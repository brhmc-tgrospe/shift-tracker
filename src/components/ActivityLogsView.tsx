import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { Trash2 } from 'lucide-react';
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

export function ActivityLogsView() {
  const { token, user } = useAuth();
  const modal = useModal();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState('');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/activity-logs', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch logs');
      setLogs(await res.json());
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePurge = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both a start and end date');
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    if (!(await modal.confirm(`Are you sure you want to permanently delete logs from ${startDate} to ${endDate}?`))) {
      return;
    }

    try {
      const res = await fetch('/api/activity-logs/purge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ startDate, endDate })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      toast.success('Logs purged successfully');
      fetchLogs();
      setStartDate('');
      setEndDate('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (user?.role !== 'Developer') {
    return <div className="p-4 sm:p-6 lg:p-8">Access Denied</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 border border-red-100 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Logs</h2>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white text-sm"
          />
          <span className="text-gray-500 dark:text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white text-sm"
          />
          <button
            onClick={handlePurge}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Purge Logs
          </button>
        </div>
      </div>

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
                    No logs found.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.actor_firstName} {log.actor_lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.target_firstName ? `${log.target_firstName} ${log.target_lastName}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      <pre className="text-xs whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
