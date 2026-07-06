import React, { useState, useEffect } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { useAuth, User } from '../context/AuthContext';
import { ScheduleGrid } from './ScheduleGrid';
import { motion, AnimatePresence } from 'framer-motion';

interface UserScheduleOverviewModalProps {
  onClose: () => void;
}

export function UserScheduleOverviewModal({ onClose }: UserScheduleOverviewModalProps) {
  const { token } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Record<string, any>>({});
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsersAndShifts();
  }, [currentDate]);

  const fetchUsersAndShifts = async () => {
    setIsLoading(true);
    try {
      const [usersRes, shiftsRes] = await Promise.all([
        fetch('/api/public/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/public/shifts?month=${format(currentDate, 'yyyy-MM')}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (!usersRes.ok || !shiftsRes.ok) throw new Error('Failed to fetch data');
      
      const [usersData, shiftsData] = await Promise.all([usersRes.json(), shiftsRes.json()]);
      
      setUsers(usersData);

      const shiftsMap: Record<string, any> = {};
      shiftsData.forEach((s: any) => {
        shiftsMap[`${s.user_id}-${s.date}`] = s;
      });
      setShifts(shiftsMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const departments = ['All', ...Array.from(new Set(users.map(u => u.department_name || 'No Department')))].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    const order = [
      'IT Regular',
      'Audio/Visual and Stock Management',
      'Technical Support',
      'Network Management',
      'HOMIS Support',
      'System Development'
    ];
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  const filteredUsers = users.filter(u => departmentFilter === 'All' || (u.department_name || 'No Department') === departmentFilter);
  const groupedUsers = filteredUsers.reduce((acc, user) => {
    const dept = user.department_name || 'No Department';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(user);
    return acc;
  }, {} as Record<string, User[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
        className="relative w-full max-w-7xl h-[90vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">All Schedules</h3>
            
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
              <button 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[120px] text-center">
                {format(currentDate, 'MMMM yyyy')}
              </span>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">Department:</label>
              <select 
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white w-full sm:w-auto"
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="flex-grow p-4 sm:p-6 overflow-hidden flex flex-col relative">
          {error && (
            <div className="mb-4 p-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}
          <ScheduleGrid
            currentDate={currentDate}
            groupedUsers={groupedUsers}
            shifts={shifts}
            readOnly={true}
            hideSignatories={true}
            hideTotalHours={true}
            isLoading={isLoading}
            enableLegendFilter={true}
          />
        </div>
      </motion.div>
    </div>
  );
}
