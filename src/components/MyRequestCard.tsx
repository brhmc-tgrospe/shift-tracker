import React from 'react';
import { ScheduleRequest, SHIFTS } from '../types';
import { Check, X, Pencil, Trash2, Eye } from 'lucide-react';

interface MyRequestCardProps {
  key?: React.Key;
  request: ScheduleRequest;
  currentUserId?: number;
  isSelected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onTargetAction: (id: number, status: 'accepted' | 'denied') => void;
  onView: (request: ScheduleRequest) => void;
  onEdit: (request: ScheduleRequest) => void;
  onDelete: (id: number) => void;
  isConfirmingDelete: boolean;
  onSetConfirmDelete: (id: number | null) => void;
  formatDateLine: (d: any) => string;
}

export function MyRequestCard({
  request,
  currentUserId,
  isSelected,
  onSelect,
  onTargetAction,
  onView,
  onEdit,
  onDelete,
  isConfirmingDelete,
  onSetConfirmDelete,
  formatDateLine
}: MyRequestCardProps) {
  const isRequester = request.requester_id === currentUserId;
  const isTarget = request.target_user_id === currentUserId;
  const canEdit = isRequester && request.admin_status === 'pending' && (request.type !== 'swap' || request.target_status === 'pending');
  const canDelete = isRequester;

  return (
    <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canDelete && (
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={isSelected}
              onChange={(e) => onSelect(request.id, e.target.checked)}
              aria-label={`Select request ${request.id}`}
            />
          )}
          <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-md ${
            request.type === 'change'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          }`}>
            {request.type === 'change' ? 'Change' : 'Swap'}
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(request.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Details */}
      <div className="text-sm">
        {request.type === 'change' && (
          <div className="flex flex-col gap-1 text-sm">
            {request.details.updates ? (
              request.details.updates.map((u: any, i: number) => {
                const safeDateObj = new Date(`${u.date}T12:00:00`);
                const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const currentLabel = SHIFTS[u.currentShift as keyof typeof SHIFTS]?.label || u.currentShift;
                const reqLabel = SHIFTS[u.requestedShift as keyof typeof SHIFTS]?.label || u.requestedShift;
                return (
                  <div key={i} className="text-gray-900 dark:text-gray-100">
                    <span className="font-semibold">{u.date} ({dayName}):</span> {currentLabel} &rarr; {reqLabel}
                  </div>
                );
              })
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {request.type === 'swap' && (
          <div className="flex flex-col gap-2 mt-1">
            <div>
              <span className="font-semibold block mb-0.5 text-xs text-gray-500 dark:text-gray-400">
                {isRequester ? 'You give:' : `${request.requester_firstName} gives:`}
              </span>
              <div className="flex flex-col gap-1 text-sm pl-2">
                {request.details.requesterDates?.map((d: any) => (
                  <div key={d.date} className="text-gray-900 dark:text-gray-100">{formatDateLine(d)}</div>
                ))}
              </div>
            </div>
            <div>
              <span className="font-semibold block mb-0.5 text-xs text-gray-500 dark:text-gray-400">
                {isTarget ? 'You give:' : `${request.target_firstName} gives:`}
              </span>
              <div className="flex flex-col gap-1 text-sm pl-2">
                {request.details.targetDates?.map((d: any) => (
                  <div key={d.date} className="text-gray-900 dark:text-gray-100">{formatDateLine(d)}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {request.reason && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic" title={request.reason}>
            "{request.reason}"
          </div>
        )}
      </div>

      {/* Status + Actions row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center gap-3 text-xs">
          {request.type === 'swap' && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Target:</span>
              <span className={`font-semibold ${
                request.target_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                request.target_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                'text-orange-500'
              }`}>
                {request.target_status?.toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Admin:</span>
            <span className={`font-semibold ${
              request.admin_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
              request.admin_status === 'denied' ? 'text-red-600 dark:text-red-400' :
              'text-orange-500'
            }`}>
              {request.admin_status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex gap-1 items-center">
          {/* Target user accept/deny for swaps */}
          {isTarget && request.type === 'swap' && request.target_status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => onTargetAction(request.id, 'accepted')}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md transition-colors"
                title="Accept Swap"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onTargetAction(request.id, 'denied')}
                className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                title="Deny Swap"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}

          {/* View button */}
          <button
            type="button"
            onClick={() => onView(request)}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
            title="View Request"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Edit button */}
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(request)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
              title="Edit Request"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}

          {/* Delete button */}
          {canDelete && (
            isConfirmingDelete ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDelete(request.id)}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => onSetConfirmDelete(null)}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSetConfirmDelete(request.id)}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                title="Delete Request"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {request.admin_remark && (
        <div className="mt-1 text-xs text-red-500 dark:text-red-400 italic bg-red-50 dark:bg-red-900/20 p-2 rounded">
          Admin note: {request.admin_remark}
        </div>
      )}
    </div>
  );
}
