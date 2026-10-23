import React, { useState, useMemo } from 'react';
import { ScheduleRequest, SHIFTS, ScheduleRequestUpdateItem, formatShiftDateLine, formatShiftLabel } from '../types';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface RequestActionCardProps {
  request: ScheduleRequest;
  token: string | null;
  onActionComplete?: () => void;
  showActions?: boolean;
}

export function RequestActionCard({ request, token, onActionComplete, showActions = true }: RequestActionCardProps) {
  const [processing, setProcessing] = useState(false);
  
  // Deny modal state: targetDenyIndex === null means "Deny All" or Swap; number means single line
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [targetDenyIndex, setTargetDenyIndex] = useState<number | null>(null);
  const [remark, setRemark] = useState('');

  // Normalized lines for change requests
  const lines: ScheduleRequestUpdateItem[] = useMemo(() => {
    if (request.type !== 'change') return [];
    if (request.details.updates && request.details.updates.length > 0) {
      return request.details.updates;
    }
    if (request.details.dates && request.details.dates.length > 0) {
      return request.details.dates.map((d: any) => ({
        date: d.date,
        currentShift: 'free',
        requestedShift: d.shift,
        hours: d.hours,
        status: d.status,
        remark: d.remark
      }));
    }
    return [];
  }, [request.type, request.details]);

  const formatDateLine = (d: any) => formatShiftDateLine(d);

  const isPendingAdmin = request.admin_status === 'pending' && (request.type !== 'swap' || request.target_status === 'accepted');

  // Direct action to approve a single line
  const handleLineApprove = async (index: number) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          singleLineDecision: {
            index,
            status: 'accepted'
          }
        })
      });

      if (res.ok) {
        toast.success(`Date ${lines[index]?.date} approved`);
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to approve date');
      }
    } catch (e) {
      console.error('Failed to approve date', e);
      toast.error('Failed to approve date');
    } finally {
      setProcessing(false);
    }
  };

  // Reset an already-decided line back to pending (if request is still pending)
  const handleResetLine = async (index: number) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          singleLineDecision: {
            index,
            status: 'pending'
          }
        })
      });

      if (res.ok) {
        toast.success(`Date ${lines[index]?.date} reset to pending`);
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to reset date');
      }
    } catch (e) {
      console.error('Failed to reset date', e);
      toast.error('Failed to reset date');
    } finally {
      setProcessing(false);
    }
  };

  // Direct action to approve all lines in the change request
  const handleApproveAll = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'accepted' })
      });

      if (res.ok) {
        toast.success('All dates approved successfully');
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to approve all dates');
      }
    } catch (e) {
      console.error('Failed to approve all', e);
      toast.error('Failed to approve all');
    } finally {
      setProcessing(false);
    }
  };

  // Open deny modal for single line or entire request
  const handleOpenDenyModal = (index: number | null) => {
    setTargetDenyIndex(index);
    setRemark('');
    setDenyModalOpen(true);
  };

  // Confirm denial from modal
  const handleConfirmDeny = async () => {
    if (!remark.trim()) {
      toast.error('Please enter a remark explaining the denial.');
      return;
    }

    setProcessing(true);
    try {
      let bodyData: any;
      if (request.type === 'change' && targetDenyIndex !== null) {
        // Denying a single specific line
        bodyData = {
          singleLineDecision: {
            index: targetDenyIndex,
            status: 'denied',
            remark: remark.trim()
          }
        };
      } else {
        // Denying entire request or swap
        bodyData = {
          status: 'denied',
          remark: remark.trim()
        };
      }

      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        setDenyModalOpen(false);
        setRemark('');
        toast.success(targetDenyIndex !== null ? 'Date denied' : 'Request denied');
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to process denial');
      }
    } catch (e) {
      console.error('Denial failed', e);
      toast.error('Failed to process denial');
    } finally {
      setProcessing(false);
    }
  };

  // Whole accept for swap requests
  const handleAcceptSwap = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'accepted' })
      });
      if (res.ok) {
        toast.success('Swap request accepted');
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to accept swap');
      }
    } catch (e) {
      console.error('Accept swap failed', e);
      toast.error('Failed to accept swap');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Schedule Change Requests */}
      {request.type === 'change' && (
        <div className="flex flex-col gap-2">
          {/* Quick Header: Only "Approve All" and "Deny All" when pending, actions enabled, and more than 1 date */}
          {showActions && isPendingAdmin && lines.length > 1 && (
            <div className="flex items-center justify-between p-1.5 bg-gray-50/80 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
              <span className="font-medium text-gray-600 dark:text-gray-300 pl-1">
                Requested Dates ({lines.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleApproveAll}
                  disabled={processing}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 rounded-md transition-colors disabled:opacity-50"
                  title="Approve all requested dates in this request"
                >
                  Approve All
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenDenyModal(null)}
                  disabled={processing}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-300 dark:border-rose-800 rounded-md transition-colors disabled:opacity-50"
                  title="Deny all requested dates in this request"
                >
                  Deny All
                </button>
              </div>
            </div>
          )}

          {/* Line Items */}
          <div className="flex flex-col gap-1.5 text-sm">
            {lines.map((u, i) => {
              const safeDateObj = new Date(`${u.date}T12:00:00`);
              const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
              const currentLabel = formatShiftLabel(u.currentShift);
              const reqLabel = formatShiftLabel(u.requestedShift);

              const rowBorderClass = u.status === 'accepted'
                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                : u.status === 'denied'
                ? 'border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-950/20'
                : 'border-gray-200 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/50';

              return (
                <div
                  key={`${u.date}-${i}`}
                  className={`flex flex-col gap-1 p-2.5 rounded-lg border transition-colors ${rowBorderClass}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Left: Date & Shift Info */}
                  <div className="text-gray-900 dark:text-gray-100">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {u.date} ({dayName}):
                    </span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">{currentLabel}</span>{' '}
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">&rarr;</span>{' '}
                    <span className="font-semibold text-gray-900 dark:text-white">{reqLabel}</span>
                  </div>

                  {/* Right: Direct Action Buttons or Status Badge */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {u.status === 'accepted' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <Check className="w-3.5 h-3.5" /> Approved
                        </span>
                        {showActions && isPendingAdmin && (
                          <button
                            type="button"
                            onClick={() => handleResetLine(i)}
                            disabled={processing}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline ml-0.5"
                            title="Undo decision for this date"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    ) : u.status === 'denied' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <X className="w-3.5 h-3.5" /> Denied
                        </span>
                        {showActions && isPendingAdmin && (
                          <button
                            type="button"
                            onClick={() => handleResetLine(i)}
                            disabled={processing}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline ml-0.5"
                            title="Undo decision for this date"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    ) : showActions && isPendingAdmin ? (
                      <div className="inline-flex rounded-md shadow-xs" role="group" aria-label={`Decision for ${u.date}`}>
                        <button
                          type="button"
                          onClick={() => handleLineApprove(i)}
                          disabled={processing}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-l-md transition-all bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDenyModal(i)}
                          disabled={processing}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-r-md transition-all bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 border-t border-r border-b border-gray-300 dark:border-gray-600 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Deny
                        </button>
                      </div>
                    ) : (
                      <div>
                        {(!u.status && request.admin_status === 'accepted') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {(!u.status && request.admin_status === 'denied') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <X className="w-3 h-3" /> Denied
                          </span>
                        )}
                        {(!u.status && request.admin_status === 'pending') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Pending
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {u.status === 'denied' && u.remark && (
                  <div className="text-xs text-rose-600 dark:text-rose-400 pl-1 font-medium">
                    Reason: {u.remark}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Schedule Swap Requests (All-or-nothing trade between coworkers) */}
      {request.type === 'swap' && (
        <div className="flex flex-col gap-2 mt-1 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
          <div>
            <span className="font-semibold block mb-1 text-gray-900 dark:text-gray-100">
              {request.requester_firstName} gives:
            </span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {request.details.requesterDates?.map((d: any) => (
                <div key={d.date} className="text-gray-900 dark:text-gray-100">
                  {formatDateLine(d)}
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="font-semibold block mb-1 text-gray-900 dark:text-gray-100">
              {request.target_firstName} gives:
            </span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {request.details.targetDates?.map((d: any) => (
                <div key={d.date} className="text-gray-900 dark:text-gray-100">
                  {formatDateLine(d)}
                </div>
              ))}
            </div>
          </div>

          {showActions && isPendingAdmin && (
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              <button
                type="button"
                onClick={handleAcceptSwap}
                disabled={processing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-md transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Accept Swap
              </button>
              <button
                type="button"
                onClick={() => handleOpenDenyModal(null)}
                disabled={processing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-md transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Deny Swap
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unified Denial Modal (for single line or entire request) */}
      {denyModalOpen && (
        <div className="mt-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {targetDenyIndex !== null && lines[targetDenyIndex]
              ? `Reason for denying date ${lines[targetDenyIndex].date} (Required):`
              : 'Reason for denial (Required):'}
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border-gray-300 shadow-xs focus:border-red-500 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs p-2"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Enter reason for denial..."
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setDenyModalOpen(false);
                setRemark('');
                setTargetDenyIndex(null);
              }}
              disabled={processing}
              className="px-3 py-1 text-xs border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeny}
              disabled={!remark.trim() || processing}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Confirm Deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
