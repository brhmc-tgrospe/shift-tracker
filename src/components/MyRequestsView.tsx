import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ScheduleRequest, SHIFTS, DayData } from '../types';
import { Check, X, Pencil, Trash2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { RequestChangeModal } from './RequestChangeModal';
import { SwapScheduleModal } from './SwapScheduleModal';
import { RequestDetailsModal } from './RequestDetailsModal';
import { DatePicker } from './DatePicker';
import { useModal } from '../context/ModalContext';

interface Props {
  dayDataMap: Record<string, DayData>;
}

export function MyRequestsView({ dayDataMap }: Props) {
  const { user, token } = useAuth();
  const modal = useModal();
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChange, setEditingChange] = useState<ScheduleRequest | null>(null);
  const [editingSwap, setEditingSwap] = useState<ScheduleRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<ScheduleRequest | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterFrom, filterTo, itemsPerPage]);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/requests/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (e) {
      console.error('Failed to fetch requests', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [token]);

  const handleTargetAction = async (id: number, status: 'accepted' | 'denied') => {
    try {
      const res = await fetch(`/api/requests/${id}/target`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchRequests();
        toast.success(`Swap request ${status}`);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to process request');
      }
    } catch (e) {
      console.error('Action failed', e);
      toast.error('Failed to process request');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Request deleted');
        fetchRequests();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to delete request');
      }
    } catch (e) {
      console.error('Delete failed', e);
      toast.error('Failed to delete request');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await modal.confirm(`Are you sure you want to delete ${selectedIds.size} request(s)?`))) return;

    try {
      const res = await fetch('/api/requests/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        toast.success(`Deleted ${selectedIds.size} request(s)`);
        setSelectedIds(new Set());
        fetchRequests();
      } else {
        toast.error('Failed to delete requests');
      }
    } catch (e) {
      toast.error('Failed to delete requests');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const deletableRequests = paginatedRequests.filter(req => req.requester_id === user?.id && req.admin_status !== 'accepted');
    if (e.target.checked) {
      const newSelected = new Set(selectedIds);
      deletableRequests.forEach(req => newSelected.add(req.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      deletableRequests.forEach(req => newSelected.delete(req.id));
      setSelectedIds(newSelected);
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const formatDateLine = (d: any) => {
    const safeDateObj = new Date(`${d.date}T12:00:00`);
    const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours ?? 0;
    return `${d.date} (${dayName}) | ${hours} Hours`;
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading your requests...</div>;

  const filteredRequests = requests.filter(req => {
    const reqDate = new Date(req.created_at);
    reqDate.setHours(0, 0, 0, 0);
    if (filterFrom) {
      const fromDate = new Date(`${filterFrom}T00:00:00`);
      if (reqDate < fromDate) return false;
    }
    if (filterTo) {
      const toDate = new Date(`${filterTo}T23:59:59`);
      if (reqDate > toDate) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">My Schedule Requests</h2>
      
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2">
          <DatePicker value={filterFrom} onChange={setFilterFrom} placeholder="Filter From" className="w-40" />
          <span className="text-gray-500">-</span>
          <DatePicker value={filterTo} onChange={setFilterTo} placeholder="Filter To" className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">Show</label>
          <select
            value={itemsPerPage}
            onChange={e => setItemsPerPage(Number(e.target.value))}
            className="rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm px-3 py-2"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-4 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
          <span className="text-sm font-medium text-red-800 dark:text-red-200">
            {selectedIds.size} request(s) selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-4 w-12">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    disabled={!paginatedRequests.some(req => req.requester_id === user?.id && req.admin_status !== 'accepted')}
                    checked={
                      paginatedRequests.some(req => req.requester_id === user?.id && req.admin_status !== 'accepted') &&
                      paginatedRequests.filter(req => req.requester_id === user?.id && req.admin_status !== 'accepted').every(req => selectedIds.has(req.id))
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Details</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedRequests.map(req => {
                const isRequester = req.requester_id === user?.id;
                const isTarget = req.target_user_id === user?.id;
                const canEdit = isRequester && req.admin_status === 'pending' && (req.type !== 'swap' || req.target_status === 'pending');
                const canDelete = isRequester && req.admin_status !== 'accepted';

                return (
                  <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-4">
                      {canDelete ? (
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.has(req.id)}
                          onChange={(e) => handleSelectRow(req.id, e.target.checked)}
                        />
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {req.type === 'change' && (
                        <div className="flex flex-col gap-1 text-sm">
                          {req.details.updates ? (
                            req.details.updates.map((u: any, i: number) => {
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
                              {req.details.dates?.length === 1 && (
                                <div className="text-gray-900 dark:text-gray-100">
                                  <span className="font-semibold mr-1">From:</span>
                                  Unknown (Original Schedule)
                                </div>
                              )}
                              {req.details.dates?.map((d: any, i: number) => {
                                const prefix = req.details.dates!.length === 2 ? (i === 0 ? 'From:' : 'To:') : 'To:';
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
                      {req.type === 'swap' && (
                        <div className="flex flex-col gap-2 mt-1">
                          <div>
                            <span className="font-semibold block mb-1">{isRequester ? 'You give:' : `${req.requester_firstName} gives:`}</span>
                            <div className="flex flex-col gap-1 text-sm pl-2">
                              {req.details.requesterDates?.map((d: any) => (
                                <div key={d.date} className="text-gray-900 dark:text-gray-100">{formatDateLine(d)}</div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-semibold block mb-1">{isTarget ? 'You give:' : `${req.target_firstName} gives:`}</span>
                            <div className="flex flex-col gap-1 text-sm pl-2">
                              {req.details.targetDates?.map((d: any) => (
                                <div key={d.date} className="text-gray-900 dark:text-gray-100">{formatDateLine(d)}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-500 italic max-w-xs truncate" title={req.reason}>
                        "{req.reason}"
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {req.type === 'swap' && (
                          <div className="flex items-center justify-between w-24">
                            <span className="text-gray-500">Target:</span>
                            <span className={`font-medium ${
                              req.target_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                              req.target_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                              'text-orange-500'
                            }`}>
                              {req.target_status?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between w-24">
                          <span className="text-gray-500">Admin:</span>
                          <span className={`font-medium ${
                            req.admin_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                            req.admin_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                            'text-orange-500'
                          }`}>
                            {req.admin_status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {req.admin_remark && (
                        <div className="mt-1 text-xs text-red-500 dark:text-red-400 italic">
                          Admin note: {req.admin_remark}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-1 justify-end items-center">
                        {/* Target user accept/deny for swaps */}
                        {isTarget && req.type === 'swap' && req.target_status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleTargetAction(req.id, 'accepted')}
                              className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md transition-colors"
                              title="Accept Swap"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleTargetAction(req.id, 'denied')}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                              title="Deny Swap"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        )}

                        {/* View button */}
                        <button
                          onClick={() => setViewingRequest(req)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                          title="View Request"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Edit button for pending requests */}
                        {canEdit && (
                          <button
                            onClick={() => req.type === 'change' ? setEditingChange(req) : setEditingSwap(req)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                            title="Edit Request"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete button */}
                        {canDelete && (
                          deleteConfirmId === req.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(req.id)}
                                className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(req.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                              title="Delete Request"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRequests.length)} of {filteredRequests.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit and View modals */}
      {editingChange && (
        <RequestChangeModal
          onClose={() => setEditingChange(null)}
          onSuccess={() => { setEditingChange(null); fetchRequests(); }}
          dayDataMap={dayDataMap}
          editRequest={editingChange}
        />
      )}
      {editingSwap && (
        <SwapScheduleModal
          onClose={() => setEditingSwap(null)}
          onSuccess={() => { setEditingSwap(null); fetchRequests(); }}
          editRequest={editingSwap}
          dayDataMap={dayDataMap}
        />
      )}
      {viewingRequest && (
        <RequestDetailsModal 
          request={viewingRequest}
          onClose={() => setViewingRequest(null)}
        />
      )}
    </div>
  );
}
