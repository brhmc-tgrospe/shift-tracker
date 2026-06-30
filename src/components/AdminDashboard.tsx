import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, Calendar, Moon, Sun, Briefcase, Coffee, Umbrella, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface MetricUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  department_name: string;
  shift: string;
  hours: number;
}

interface MetricData {
  count: number;
  users: MetricUser[];
}

interface DashboardMetrics {
  working: MetricData;
  dayOff: MetricData;
  onLeave: MetricData;
}

export function AdminDashboard() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalData, setModalData] = useState<{ title: string; users: MetricUser[] } | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/dashboard/metrics', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch metrics');
        const data = await res.json();
        setMetrics(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMetrics();
  }, [token]);

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400 animate-pulse">Loading dashboard...</div>;
  }

  if (error || !metrics) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error || 'Failed to load dashboard metrics.'}
        </div>
      </div>
    );
  }

  const handleCardClick = (title: string, users: MetricUser[]) => {
    setModalData({ title, users });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Today's workforce status at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard 
          title="Total Working Today" 
          count={metrics.working.count} 
          icon={<Briefcase className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />} 
          bgColor="bg-indigo-50 dark:bg-indigo-900/20"
          onClick={() => handleCardClick('Working Today', metrics.working.users)}
        />
        <MetricCard 
          title="Total Day-Off Today" 
          count={metrics.dayOff.count} 
          icon={<Coffee className="w-6 h-6 text-orange-600 dark:text-orange-400" />} 
          bgColor="bg-orange-50 dark:bg-orange-900/20"
          onClick={() => handleCardClick('Day-Off Today', metrics.dayOff.users)}
        />
        <MetricCard 
          title="Total On-Leave Today" 
          count={metrics.onLeave.count} 
          icon={<Umbrella className="w-6 h-6 text-teal-600 dark:text-teal-400" />} 
          bgColor="bg-teal-50 dark:bg-teal-900/20"
          onClick={() => handleCardClick('On-Leave Today', metrics.onLeave.users)}
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionLink to="/admin/schedule" icon={<Calendar className="w-5 h-5" />} label="Manage Schedule" />
          <QuickActionLink to="/admin/users" icon={<Users className="w-5 h-5" />} label="Manage Users" />
        </div>
      </div>

      <AnimatePresence>
        {modalData && (
          <UsersModal 
            title={modalData.title} 
            users={modalData.users} 
            onClose={() => setModalData(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ title, count, icon, bgColor, onClick }: { title: string, count: number, icon: React.ReactNode, bgColor: string, onClick: () => void }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-left w-full transition-shadow hover:shadow-md ${bgColor}`}
    >
      <div className="flex justify-between items-start">
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          {icon}
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </div>
      <div className="mt-4">
        <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{count}</h3>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">{title}</p>
      </div>
    </motion.button>
  );
}

function QuickActionLink({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) {
  return (
    <Link 
      to={to} 
      className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
    >
      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
        {icon}
      </div>
      <span className="font-medium text-gray-700 dark:text-gray-200">{label}</span>
    </Link>
  );
}

function UsersModal({ title, users, onClose }: { title: string, users: MetricUser[], onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
        className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-2">
          {users.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No employees found for this status today.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((u) => (
                <li key={u.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {u.department_name || 'No Department'}
                      </p>
                    </div>
                  </div>
                  {u.shift && u.shift !== 'free' && (
                    <span className="flex-shrink-0 px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full whitespace-nowrap">
                      {u.shift}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
