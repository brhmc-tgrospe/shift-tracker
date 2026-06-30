import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, addMonths, subMonths, getDaysInMonth, startOfMonth, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Save, Loader2, Paintbrush, Printer } from 'lucide-react';
import { useAuth, User } from '../context/AuthContext';
import { SHIFTS, ShiftType } from '../types';

// We need a palette of shift types (exclude 'on-leave' as requested)
const AVAILABLE_SHIFTS = Object.values(SHIFTS).filter(s => s.type !== 'on-leave');

export function AdminScheduleView() {
  const { token, user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Record<string, any>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Painting / Modal state
  const [selectedShiftType, setSelectedShiftType] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-save timer ref
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchUsersAndShifts();
  }, [currentDate]);

  const fetchUsersAndShifts = async () => {
    setIsLoading(true);
    try {
      const [usersRes, shiftsRes] = await Promise.all([
        fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/shifts/all?month=${format(currentDate, 'yyyy-MM')}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (!usersRes.ok || !shiftsRes.ok) throw new Error('Failed to fetch data');
      
      const [usersData, shiftsData] = await Promise.all([usersRes.json(), shiftsRes.json()]);
      
      // Filter out admins and developers
      const regularUsers = usersData.filter((u: User) => u.role === 'User');
      setUsers(regularUsers);

      const shiftsMap: Record<string, any> = {};
      shiftsData.forEach((s: any) => {
        shiftsMap[`${s.user_id}-${s.date}`] = s;
      });
      setShifts(shiftsMap);
      setPendingChanges({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    const changesArray = Object.values(pendingChanges);
    if (changesArray.length === 0) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/shifts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shifts: changesArray })
      });
      if (!res.ok) throw new Error('Failed to save shifts');
      
      // Merge pending to shifts and clear pending
      setShifts(prev => ({ ...prev, ...pendingChanges }));
      setPendingChanges({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, token]);

  // 60-second Auto-save
  useEffect(() => {
    if (Object.keys(pendingChanges).length > 0) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 60000); // 60 seconds
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [pendingChanges, handleSave]);

  const updateCell = (userId: number, dateStr: string, shiftTypeId: string) => {
    const shiftInfo = AVAILABLE_SHIFTS.find(s => s.type === shiftTypeId);
    if (!shiftInfo) return;

    const key = `${userId}-${dateStr}`;
    const newShift = {
      user_id: userId,
      date: dateStr,
      shift: shiftInfo.type,
      hours: shiftInfo.defaultHours,
      notes: ''
    };

    setPendingChanges(prev => ({
      ...prev,
      [key]: newShift
    }));
  };

  const handleCellMouseDown = (userId: number, dateStr: string) => {
    if (!selectedShiftType) return;
    setIsDragging(true);
    updateCell(userId, dateStr, selectedShiftType);
  };

  const handleCellMouseEnter = (userId: number, dateStr: string) => {
    if (!isDragging || !selectedShiftType) return;
    updateCell(userId, dateStr, selectedShiftType);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const daysInMonth = getDaysInMonth(currentDate);
  const monthStart = startOfMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));

  // Group users by department
  const groupedUsers = users.reduce((acc, user) => {
    const dept = user.department_name || 'No Department';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(user);
    return acc;
  }, {} as Record<string, User[]>);

  // Modal State for individual clicks
  const [modalOpen, setModalOpen] = useState<{ userId: number, dateStr: string } | null>(null);

  const handleCellClick = (userId: number, dateStr: string) => {
    if (selectedShiftType) {
      // If we are painting, we already handled it in mouseDown
      return;
    }
    setModalOpen({ userId, dateStr });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col h-full max-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 print:hidden">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Schedule</h2>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
            <button 
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[120px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600 print:hidden"
          >
            <Printer className="w-4 h-4" />
            Print Schedule
          </button>

          <button
            onClick={handleSave}
            disabled={Object.keys(pendingChanges).length === 0 || isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors print:hidden ${
              Object.keys(pendingChanges).length > 0 && !isSaving
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes {Object.keys(pendingChanges).length > 0 && `(${Object.keys(pendingChanges).length})`}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 print:hidden">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 mr-2">
          <Paintbrush className="w-4 h-4" /> Paint Mode:
        </span>
        <button
          onClick={() => setSelectedShiftType(null)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            selectedShiftType === null 
              ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500 dark:bg-indigo-900/50 dark:text-indigo-300' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Off (Click to edit)
        </button>
        {AVAILABLE_SHIFTS.map(st => (
          <button
            key={st.type}
            onClick={() => setSelectedShiftType(st.type)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${st.colorClass} ${
              selectedShiftType === st.type ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-gray-800' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className="flex-grow bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative select-none print:border-none print:shadow-none print:overflow-visible">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center z-10 print:hidden">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        <div className="hidden print:block text-center mb-6">
          <h1 className="text-xl font-bold uppercase">
            IHOMP-IT SCHEDULE {format(currentDate, 'MMMM yyyy')}
          </h1>
        </div>
        
        <div className="overflow-auto max-h-full print:overflow-visible print:max-h-none">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-2 print:px-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 sticky left-0 z-30 min-w-[200px] print:min-w-[120px] print:text-xs">
                  Employee
                </th>
                {days.map(day => (
                  <th key={day.toISOString()} className="px-2 py-2 print:px-0 print:py-1 text-center font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 min-w-[50px] print:min-w-[25px]">
                    <div className="text-xs print:text-[10px] uppercase">{format(day, 'EEE')}</div>
                    <div className={`text-sm print:text-xs ${format(day, 'EEE') === 'Sun' || format(day, 'EEE') === 'Sat' ? 'text-red-500' : ''}`}>
                      {format(day, 'd')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.entries(groupedUsers) as [string, User[]][]).map(([dept, deptUsers]) => (
                <React.Fragment key={dept}>
                  <tr className="bg-gray-100 dark:bg-gray-900/50">
                    <td colSpan={days.length + 1} className="px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 z-10 border-y border-gray-200 dark:border-gray-700">
                      {dept}
                    </td>
                  </tr>
                  {deptUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 group">
                      <td className="px-4 py-2 print:px-1 print:py-1 border-b border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky left-0 z-10 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/30">
                        <div className="font-medium text-gray-900 dark:text-white truncate print:text-xs print:w-[120px]">{u.firstName} {u.lastName}</div>
                      </td>
                      {days.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const key = `${u.id}-${dateStr}`;
                        const activeData = pendingChanges[key] || shifts[key];
                        
                        let cellContent = '-';
                        let cellColor = '';
                        
                        if (activeData) {
                          const shiftType = AVAILABLE_SHIFTS.find(s => s.type === activeData.shift);
                          if (shiftType && shiftType.type !== 'free') {
                            cellContent = shiftType.type;
                            cellColor = shiftType.colorClass;
                          }
                        }

                        const dayOfWeek = format(day, 'EEE');
                        if (cellContent === '-' && (dayOfWeek === 'Sat' || dayOfWeek === 'Sun')) {
                          cellContent = dayOfWeek.toUpperCase();
                        }

                        const isPending = !!pendingChanges[key];

                        return (
                          <td 
                            key={dateStr} 
                            className={`border-b border-gray-200 dark:border-gray-700 text-center p-1 print:p-0 cursor-pointer transition-colors ${
                              isPending ? 'opacity-80 border-dashed border-2 border-indigo-400' : ''
                            }`}
                            onMouseDown={() => handleCellMouseDown(u.id, dateStr)}
                            onMouseEnter={() => handleCellMouseEnter(u.id, dateStr)}
                            onClick={() => handleCellClick(u.id, dateStr)}
                          >
                            <div className={`w-full h-8 print:h-5 flex items-center justify-center rounded text-xs print:text-[9px] font-semibold ${cellColor || 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 print:text-gray-600'}`}>
                              {cellContent}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hidden print:block mt-8 text-sm">
        <div className="font-bold mb-2">LEGEND:</div>
        <div className="flex flex-wrap gap-4 mb-12">
          {AVAILABLE_SHIFTS.filter(s => s.type !== 'free').map(st => (
            <div key={st.type} className="flex items-center gap-2">
              <div className={`w-8 h-6 border flex items-center justify-center text-xs font-semibold ${st.colorClass.split(' ').filter(c => !c.includes('hover')).join(' ')}`}>
                {st.type}
              </div>
              <span>- {st.label}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-end mt-16">
          <div>
            <div className="mb-8">Prepared by:</div>
            <div className="font-bold border-b border-black pb-1 mb-1 inline-block min-w-[250px]">VLADIMIR M . PIANDO, MIS</div>
            <div>CMT III, Head, IHOMP-IT Office</div>
          </div>
          <div>
            <div className="mb-8">Approved by:</div>
            <div className="font-bold border-b border-black pb-1 mb-1 inline-block min-w-[350px]">ERIC RAYMOND N. RABORAR, MD, MPA - HEDM, MMHoA, FPS MS</div>
            <div>Medical Center Chief II</div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-gray-500/20 dark:bg-gray-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700 w-64">
            <h4 className="font-medium text-gray-900 dark:text-white mb-4 text-center">Select Shift</h4>
            <div className="flex flex-col gap-2">
              {AVAILABLE_SHIFTS.map(st => (
                <button
                  key={st.type}
                  onClick={() => {
                    updateCell(modalOpen.userId, modalOpen.dateStr, st.type);
                    setModalOpen(null);
                  }}
                  className={`px-4 py-2 rounded font-medium text-sm text-left transition-colors ${st.colorClass} hover:opacity-80`}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setModalOpen(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
