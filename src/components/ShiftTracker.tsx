import React, { useState, useEffect } from 'react';
import { Calendar } from './Calendar';
import { Legend } from './Legend';
import { Metrics } from './Metrics';
import { DayData } from '../types';
import { Briefcase, LogOut, User, Moon, Sun, ArrowLeft, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserScheduleOverviewModal } from './UserScheduleOverviewModal';
import { NotificationBell } from './NotificationBell';
import { MyRequestsView } from './MyRequestsView';
import { RequestChangeModal } from './RequestChangeModal';
import { SwapScheduleModal } from './SwapScheduleModal';
import { ArrowRightLeft, FileEdit } from 'lucide-react';
import toast from 'react-hot-toast';

export function ShiftTracker() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'calendar' | 'requests'>('calendar');
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  const { user, token, logout, login } = useAuth();
  const navigate = useNavigate();

  const devToken = localStorage.getItem('devToken');

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    setIsDarkMode(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const handleReturnToAdmin = async () => {
    if (!devToken) return;
    try {
      // We can fetch the developer's info using /api/auth/me with the devToken
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${devToken}` }
      });
      if (res.ok) {
        const devUser = await res.json();
        localStorage.removeItem('devToken');
        login(devToken, devUser);
        navigate('/admin');
      } else {
        localStorage.removeItem('devToken');
        logout();
        navigate('/login');
      }
    } catch (e) {
      localStorage.removeItem('devToken');
      logout();
      navigate('/login');
    }
  };

  const fetchShifts = async () => {
    try {
      const res = await fetch('/api/shifts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDayDataMap(data);
      }
    } catch (e) {
      console.error("Failed to load shifts", e);
    } finally {
      setIsLoaded(true);
    }
  };

  // Load from API
  useEffect(() => {
    fetchShifts();
  }, [token]);

  const handleUpdateDay = async (data: DayData) => {
    // Optimistic UI update
    setDayDataMap(prev => {
      const next = { ...prev };
      const hasNotes = data.notes && data.notes.trim() !== '';
      if (data.shift === 'free' && data.hours === 0 && !hasNotes) {
        delete next[data.date];
      } else {
        next[data.date] = data;
      }
      return next;
    });

    if (user?.role === 'User') {
      try {
        await fetch('/api/shifts/notes', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ date: data.date, notes: data.notes })
        });
      } catch (e) {
        console.error('Failed to update notes', e);
      }
      return;
    }

    try {
      await fetch('/api/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.error('Failed to save shift', e);
    }
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handlePrevYear = () => setCurrentYear(y => y - 1);
  const handleNextYear = () => setCurrentYear(y => y + 1);

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-gray-100/50 dark:bg-gray-900 text-slate-900 dark:text-gray-100 selection:bg-blue-200 transition-colors">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
        {devToken && (
          <div className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 px-4 py-2 text-sm font-medium flex justify-between items-center">
            <span>You are currently impersonating <strong>{user?.firstName} {user?.lastName}</strong>.</span>
            <button
              onClick={handleReturnToAdmin}
              className="flex items-center gap-1 hover:text-orange-900 dark:hover:text-orange-100 underline decoration-orange-400"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Admin
            </button>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-xl flex items-center justify-center shadow-sm text-white">
                <Briefcase className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Shift Tracker</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg mr-4">
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'calendar' 
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'requests' 
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  My Requests
                </button>
              </div>

              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                title="Toggle Dark Mode"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <NotificationBell />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Hi, {user?.firstName}</span>
              <button onClick={() => navigate('/profile')} className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Profile">
                <User className="w-5 h-5" />
              </button>
              <button onClick={logout} className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Logout">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'calendar' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="w-full">
                <Calendar
                  currentYear={currentYear}
                  currentMonth={currentMonth}
                  onChangeMonth={setCurrentMonth}
                  onChangeYear={setCurrentYear}
                  onPrevMonth={handlePrevMonth}
                  onNextMonth={handleNextMonth}
                  onPrevYear={handlePrevYear}
                  onNextYear={handleNextYear}
                  dayDataMap={dayDataMap}
                  onUpdateDay={handleUpdateDay}
                  readOnly={true} // Now always readOnly for standard view in ShiftTracker. Modals manage edits.
                  allowNotesEdit={true}
                />
              </div>
            </div>

            <div className="lg:col-span-4 sticky top-24 flex flex-col gap-6">
              {user?.role === 'User' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Actions</h3>
                  <button
                    onClick={() => setIsChangeModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 rounded-lg transition-colors font-medium text-sm"
                  >
                    <FileEdit className="w-4 h-4" /> Request Change
                  </button>
                  <button
                    onClick={() => setIsSwapModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 rounded-lg transition-colors font-medium text-sm"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> Swap Schedule
                  </button>
                </div>
              )}

              <Metrics
                currentYear={currentYear}
                currentMonth={currentMonth}
                dayDataMap={dayDataMap}
              />
              <Legend />
              
              <button
                onClick={() => setIsOverviewModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-colors font-medium"
              >
                <Users className="w-5 h-5" />
                View All Schedules
              </button>
            </div>
          </div>
        ) : (
          <MyRequestsView dayDataMap={dayDataMap} />
        )}
      </main>

      {isOverviewModalOpen && (
        <UserScheduleOverviewModal onClose={() => setIsOverviewModalOpen(false)} />
      )}
      
      {isChangeModalOpen && (
        <RequestChangeModal 
          onClose={() => setIsChangeModalOpen(false)} 
          onSuccess={() => { setActiveTab('requests'); fetchShifts(); }}
          dayDataMap={dayDataMap}
        />
      )}
      
      {isSwapModalOpen && (
        <SwapScheduleModal 
          onClose={() => setIsSwapModalOpen(false)} 
          onSuccess={() => { setActiveTab('requests'); fetchShifts(); }}
          dayDataMap={dayDataMap}
        />
      )}
    </div>
  );
}
