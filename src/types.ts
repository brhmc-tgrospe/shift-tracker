export type ShiftType = 'free' | '8h' | '12h-m' | '12h-e' | 'off' | 'holiday' | 'on-leave' | 'N/A' | 'absent';

export interface Department {
  id: number;
  name: string;
}

export interface ShiftDefinition {
  type: ShiftType;
  label: string;
  colorClass: string;
  defaultHours: number;
}

export const SHIFTS: Record<ShiftType, ShiftDefinition> = {
  'free': { type: 'free', label: 'Free', colorClass: 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700', defaultHours: 0 },
  '8h': { type: '8h', label: '8am-5pm', colorClass: 'bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800', defaultHours: 8 },
  '12h-m': { type: '12h-m', label: '12h Morning', colorClass: 'bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800', defaultHours: 12 },
  '12h-e': { type: '12h-e', label: '12h Evening', colorClass: 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800', defaultHours: 12 },
  'off': { type: 'off', label: 'Day Off', colorClass: 'bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800', defaultHours: 0 },
  'holiday': { type: 'holiday', label: 'Holiday', colorClass: 'bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white border-orange-600 dark:border-orange-700', defaultHours: 0 },
  'on-leave': { type: 'on-leave', label: 'On-Leave', colorClass: 'bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white border-blue-600 dark:border-blue-700', defaultHours: 8 },
  'N/A': { type: 'N/A', label: 'N/A', colorClass: 'bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-900 dark:text-purple-100 border-purple-200 dark:border-purple-800', defaultHours: 0 },
  'absent': { type: 'absent', label: 'Absent', colorClass: 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600', defaultHours: 0 },
};

export const getUserRequestableShifts = () => {
  return Object.entries(SHIFTS).filter(([k]) => k !== 'N/A' && k !== 'absent');
};

export interface DayData {
  date: string; // YYYY-MM-DD
  shift: ShiftType;
  hours: number;
  notes?: string;
}

export interface ScheduleRequest {
  id: number;
  type: 'swap' | 'change';
  requester_id: number;
  target_user_id?: number | null;
  details: {
    dates?: DayData[]; // For 'change'
    requesterDates?: DayData[]; // For 'swap'
    targetDates?: DayData[]; // For 'swap'
    updates?: { date: string, currentShift: string, requestedShift: string, hours?: number }[];
  };
  reason: string;
  target_status?: 'pending' | 'accepted' | 'denied' | null;
  admin_status: 'pending' | 'accepted' | 'denied';
  admin_remark?: string | null;
  created_at: string;
  requester_username?: string;
  requester_firstName?: string;
  requester_lastName?: string;
  target_username?: string;
  target_firstName?: string;
  target_lastName?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

