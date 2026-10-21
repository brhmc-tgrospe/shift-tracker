import React, { useState, useMemo } from 'react';
import { ScheduleRequest, SHIFTS, ScheduleRequestUpdateItem } from '../types';
import { Check, X, CheckCheck, AlertCircle } from 'lucide-react';
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
  const [remark, setRemark] = useState(request.admin_remark || '');

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
        status: d.status
      }));
    }
    return [];
  }, [request.type, request.details]);

  // Staged decisions per line index: 'accepted' | 'denied'
  const [lineDecisions, setLineDecisions] = useState<Record<number, 'accepted' | 'denied'>>(() => {
    const initial: Record<number, 'accepted' | 'denied'> = {};
    lines.forEach((l, idx) => {
      if (l.status === 'accepted' || l.status === 'denied') {
        initial[idx] = l.status;
      }
    });
    return initial;
  });

  // Selected checkboxes for batch operations
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const formatDateLine = (d: any) => {
    const safeDateObj = new Date(`${d.date}T12:00:00`);
    const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours ?? 0;
    return `${d.date} (${dayName}) | ${hours} Hours`;
  };

  const isPendingAdmin = request.admin_status === 'pending' && (request.type !== 'swap' || request.target_status === 'accepted');

  // Multi-selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIndices(new Set(lines.map((_, i) => i)));
    } else {
      setSelectedIndices(new Set());
    }
  };

  const handleToggleSelectLine = (index: number, checked: boolean) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const handleSetDecision = (index: number, status: 'accepted' | 'denied') => {
    setLineDecisions(prev => ({ ...prev, [index]: status }));
  };

  const handleApplyToSelected = (status: 'accepted' | 'denied') => {
    if (selectedIndices.size === 0) return;
    setLineDecisions(prev => {
      const next = { ...prev };
      selectedIndices.forEach(idx => {
        next[idx] = status;
      });
      return next;
    });
  };

  const handleApplyToAll = (status: 'accepted' | 'denied') => {
    const all: Record<number, 'accepted' | 'denied'> = {};
    lines.forEach((_, idx) => {
      all[idx] = status;
    });
    setLineDecisions(all);
  };

  const anyDenied = Object.values(lineDecisions).some(status => status === 'denied');
  const allDecided = lines.length > 0 && lines.every((_, idx) => !!lineDecisions[idx]);
  const acceptedCount = Object.values(lineDecisions).filter(s => s === 'accepted').length;
  const deniedCount = Object.values(lineDecisions).filter(s => s === 'denied').length;

  // Submit Granular Line Decisions (Change requests)
  const handleSubmitGranular = async () => {
    if (!allDecided) {
      toast.error('Please assign an Approve or Deny decision to every line before submitting.');
      return;
    }
    if (anyDenied && !remark.trim()) {
      toast.error('Please provide a reason/remark for the denied date(s).');
      return;
    }

    setProcessingId(request.id);
    try {
      const payload = {
        lineDecisions: lines.map((_, idx) => ({
          index: idx,
          status: lineDecisions[idx]
        })),
        remark: remark.trim()
      };

      const res = await fetch(`/api/requests/${request.id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success('Decisions submitted successfully');
        onActionComplete?.();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to submit decisions');
      }
    } catch (e) {
      console.error('Failed to submit granular decisions', e);
      toast.error('Failed to submit decisions');
    } finally {
      setProcessingId(null);
    }
  };

  // Whole request action (for Swap requests)
  const handleWholeAction = async (status: 'accepted' | 'denied', reasonText: string) => {
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

  const allLinesSelected = lines.length > 0 && lines.every((_, i) => selectedIndices.has(i));
  const someLinesSelected = selectedIndices.size > 0 && !allLinesSelected;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Schedule Change Requests */}
      {request.type === 'change' && (
        <div className="flex flex-col gap-2">
          {/* Batch Toolbar: Only when pending and actions enabled */}
          {showActions && isPendingAdmin && lines.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  aria-label="Select all lines"
                  ref={el => {
                    if (el) el.indeterminate = someLinesSelected;
                  }}
                  checked={allLinesSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span>Select All ({lines.length})</span>
              </label>

              <div className="flex items-center gap-1.5">
                {selectedIndices.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApplyToSelected('accepted')}
                      className="px-2 py-1 font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-100 rounded border border-emerald-300 dark:border-emerald-800 transition-colors"
                      title="Approve checked lines"
                    >
                      Approve Selected ({selectedIndices.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyToSelected('denied')}
                      className="px-2 py-1 font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 hover:bg-rose-100 rounded border border-rose-300 dark:border-rose-800 transition-colors"
                      title="Deny checked lines"
                    >
                      Deny Selected ({selectedIndices.size})
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleApplyToAll('accepted')}
                  className="px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  Approve All
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyToAll('denied')}
                  className="px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
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
              const currentLabel = SHIFTS[u.currentShift as keyof typeof SHIFTS]?.label || u.currentShift;
              const reqLabel = SHIFTS[u.requestedShift as keyof typeof SHIFTS]?.label || u.requestedShift;
              const lineDecision = lineDecisions[i];
              const isSelected = selectedIndices.has(i);

              // Decision color accents for the row
              const rowBorderClass = lineDecision === 'accepted'
                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                : lineDecision === 'denied'
                ? 'border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-950/20'
                : 'border-gray-200 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-800/50';

              return (
                <div
                  key={`${u.date}-${i}`}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border transition-colors ${rowBorderClass}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {showActions && isPendingAdmin && (
                      <input
                        type="checkbox"
                        aria-label={`Select line ${u.date}`}
                        checked={isSelected}
                        onChange={(e) => handleToggleSelectLine(i, e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                    )}
                    <div className="text-gray-900 dark:text-gray-100">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {u.date} ({dayName}):
                      </span>{' '}
                      <span className="text-gray-600 dark:text-gray-400">{currentLabel}</span>{' '}
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">&rarr;</span>{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{reqLabel}</span>
                    </div>
                  </div>

                  {/* Right side: Interactive Toggles if pending; Badges if decided */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {showActions && isPendingAdmin ? (
                      <div className="inline-flex rounded-md shadow-xs" role="group" aria-label={`Decision for ${u.date}`}>
                        <button
                          type="button"
                          onClick={() => handleSetDecision(i, 'accepted')}
                          aria-pressed={lineDecision === 'accepted'}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-l-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 border ${
                            lineDecision === 'accepted'
                              ? 'bg-emerald-600 text-white border-emerald-600 z-10'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetDecision(i, 'denied')}
                          aria-pressed={lineDecision === 'denied'}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-r-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 border-t border-r border-b ${
                            lineDecision === 'denied'
                              ? 'bg-rose-600 text-white border-rose-600 z-10'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" /> Deny
                        </button>
                      </div>
                    ) : (
                      // Display-only Badge for completed/viewing requests
                      <div>
                        {(u.status === 'accepted' || (!u.status && request.admin_status === 'accepted')) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {(u.status === 'denied' || (!u.status && request.admin_status === 'denied')) && (
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
              );
            })}
          </div>

          {/* Staged Denial Remark Box: Only shown if at least one line is denied */}
          {showActions && isPendingAdmin && anyDenied && (
            <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg">
              <label
                htmlFor={`remark-${request.id}`}
                className="block text-xs font-semibold text-rose-800 dark:text-rose-300 mb-1"
              >
                Reason for Denial (Required for employee notification):
              </label>
              <textarea
                id={`remark-${request.id}`}
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Explain why requested date(s) cannot be approved..."
                className="w-full rounded-md border-rose-300 shadow-xs focus:border-rose-500 focus:ring-rose-500 dark:bg-gray-800 dark:border-rose-800 dark:text-white text-xs p-2"
              />
            </div>
          )}

          {/* Submit Decision Button for Staged Change Requests */}
          {showActions && isPendingAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/80 mt-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {allDecided ? (
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Decision: {acceptedCount} approved, {deniedCount} denied
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5" /> Decide all lines to enable submission
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSubmitGranular}
                disabled={!allDecided || (anyDenied && !remark.trim()) || processingId !== null}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCheck className="w-4 h-4" />
                {processingId !== null ? 'Submitting...' : 'Submit Decision'}
              </button>
            </div>
          )}
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
                onClick={() => handleWholeAction('accepted', '')}
                disabled={processingId !== null}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-md transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Accept Swap
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemark('');
                  setDenyModalOpen(true);
                }}
                disabled={processingId !== null}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-md transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Deny Swap
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
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm p-2"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Enter remarks..."
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setDenyModalOpen(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleWholeAction('denied', remark)}
                  disabled={!remark.trim() || processingId !== null}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
