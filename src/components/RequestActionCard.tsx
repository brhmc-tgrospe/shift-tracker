import React, { useState } from 'react';
import { ScheduleRequest, SHIFTS } from '../types';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface RequestActionCardProps {
  request: ScheduleRequest;
  token: string | null;
  onActionComplete?: () => void;
  showActions?: boolean;
}

export function RequestActionCard({ request, token, onActionComplete, showActions = true }: RequestActionCardProps) {
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [remark, setRemark] = useState('');

  const formatDateLine = (d: any) => {
    const safeDateObj = new Date(`${d.date}T12:00:00`);
    const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours ?? 0;
    return `${d.date} (${dayName}) | ${hours} Hours`;
  };

  const handleAction = async (status: 'accepted' | 'denied', reasonText: string) => {
    if (status === 'denied' && !reasonText) {
      toast.error('Please enter a remark for denying the request.');
      return;
    }
    setProcessingId(request.id);
    try {
      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, remark: reasonText })
      });
      if (res.ok) {
        setRemark('');
        setDenyModalOpen(false);
        onActionComplete?.();
        toast.success(`Request ${status} successfully`);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to process request');
      }
    } catch (e) {
      console.error('Action failed', e);
      toast.error('Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const renderDetails = () => {
    if (request.type === 'change') {
      return (
        <div className="flex flex-col gap-1 text-sm">
          {request.details.updates ? (
            request.details.updates.map((u: any, i: number) => {
              const safeDateObj = new Date(`${u.date}T12:00:00`);
              const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
              const currentLabel = SHIFTS[u.currentShift as keyof typeof SHIFTS]?.label || u.currentShift;
              const reqLabel = SHIFTS[u.requestedShift as keyof typeof SHIFTS]?.label || u.requestedShift;
              return (
                <div key={i} className="text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                  <span className="font-semibold">{u.date} ({dayName}):</span> {currentLabel} &rarr; {reqLabel}
                </div>
              );
            })
          ) : (
            <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
              {request.details.dates?.length === 1 && (
                <div className="text-gray-900 dark:text-gray-100">
                  <span className="font-semibold mr-1">From:</span>
                  Unknown (Original Schedule)
                </div>
              )}
              {request.details.dates?.map((d: any, i: number) => {
                const prefix = request.details.dates!.length === 2 ? (i === 0 ? 'From:' : 'To:') : 'To:';
                return (
                  <div key={`${d.date}-${i}`} className="text-gray-900 dark:text-gray-100">
                    <span className="font-semibold mr-1">{prefix}</span>
                    {formatDateLine(d)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    } else if (request.type === 'swap') {
      return (
        <div className="flex flex-col gap-2 mt-1 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
          <div>
            <span className="font-semibold block mb-1">{request.requester_firstName} gives:</span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {request.details.requesterDates?.map((d: any) => (
                <div key={d.date} className="text-gray-900 dark:text-gray-100">
                  {formatDateLine(d)}
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="font-semibold block mb-1">{request.target_firstName} gives:</span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {request.details.targetDates?.map((d: any) => (
                <div key={d.date} className="text-gray-900 dark:text-gray-100">
                  {formatDateLine(d)}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  };

  const isPendingAdmin = request.admin_status === 'pending' && (request.type !== 'swap' || request.target_status === 'accepted');

  return (
    <div className="flex flex-col gap-4 w-full">
      {renderDetails()}
      
      {showActions && isPendingAdmin && (
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            onClick={() => handleAction('accepted', '')}
            disabled={processingId !== null}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-md transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Accept
          </button>
          <button
            onClick={() => {
              setRemark('');
              setDenyModalOpen(true);
            }}
            disabled={processingId !== null}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" /> Deny
          </button>
        </div>
      )}

      {denyModalOpen && (
        <div className="mt-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reason for denial
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Enter remarks..."
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setDenyModalOpen(false)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction('denied', remark)}
              disabled={!remark.trim() || processingId !== null}
              className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
