import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ScheduleRequest, SHIFTS } from '../types';
import { Check, X, Clock, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { RequestFilters } from './RequestFilters';
import { Pagination } from './Pagination';
import { RequestChangeModal } from './RequestChangeModal';
import { SwapScheduleModal } from './SwapScheduleModal';
import { useModal } from '../context/ModalContext';

export function ScheduleRequestsAdminView() {
  const { token, user } = useAuth();
  const modal = useModal();
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyRequestId, setDenyRequestId] = useState<number | null>(null);
  const [remark, setRemark] = useState('');

  const [editingChange, setEditingChange] = useState<ScheduleRequest | null>(null);
  const [editingSwap, setEditingSwap] = useState<ScheduleRequest | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterType, setDateFilterType] = useState<'created' | 'shift'>('created');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/requests', {
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

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // 1. Search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const requesterName = `${req.requester_firstName} ${req.requester_lastName}`.toLowerCase();
        const targetName = req.type === 'swap' ? `${req.target_firstName} ${req.target_lastName}`.toLowerCase() : '';
        const reason = req.reason?.toLowerCase() || '';
        
        if (!requesterName.includes(search) && !targetName.includes(search) && !reason.includes(search)) {
          return false;
        }
      }

      // 2. Date filters
      if (dateFrom || dateTo) {
        const from = dateFrom ? new Date(dateFrom).getTime() : 0;
        const to = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : Infinity;

        if (dateFilterType === 'created') {
          const createdTime = new Date(req.created_at).getTime();
          if (createdTime < from || createdTime > to) return false;
        } else {
          // shift dates
          let shiftDates: string[] = [];
          if (req.type === 'change' && req.details.dates) {
            shiftDates = req.details.dates.map((d: any) => d.date);
          } else if (req.type === 'swap') {
            const reqDates = req.details.requesterDates?.map((d: any) => d.date) || [];
            const tgtDates = req.details.targetDates?.map((d: any) => d.date) || [];
            shiftDates = [...reqDates, ...tgtDates];
          }

          if (shiftDates.length > 0) {
            const hasMatchingShift = shiftDates.some(dateStr => {
              const shiftTime = new Date(`${dateStr}T12:00:00`).getTime();
              return shiftTime >= from && shiftTime <= to;
            });
            if (!hasMatchingShift) return false;
          } else {
            return false;
          }
        }
      }

      return true;
    });
  }, [requests, searchTerm, dateFilterType, dateFrom, dateTo]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilterType, dateFrom, dateTo, rowsPerPage]);

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRequests.slice(start, start + rowsPerPage);
  }, [filteredRequests, currentPage, rowsPerPage]);

  useEffect(() => {
    fetchRequests();
  }, [token]);

  const formatDateLine = (d: any) => {
    const safeDateObj = new Date(`${d.date}T12:00:00`);
    const dayName = safeDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = SHIFTS[d.shift as keyof typeof SHIFTS]?.defaultHours ?? 0;
    return `${d.date} (${dayName}) | ${hours} Hours`;
  };

  const handleAction = async (id: number, status: 'accepted' | 'denied', reasonText: string) => {
    if (status === 'denied' && !reasonText) {
      toast.error('Please enter a remark for denying the request.');
      return;
    }

    setProcessingId(id);
    try {
      const res = await fetch(`/api/requests/${id}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, remark: reasonText })
      });
      if (res.ok) {
        setRemark('');
        fetchRequests();
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

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Request deleted successfully');
        fetchRequests();
      } else {
        toast.error('Failed to delete request');
      }
    } catch (e) {
      toast.error('Failed to delete request');
    }
    setDeleteConfirmId(null);
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
    if (e.target.checked) {
      const newSelected = new Set(selectedIds);
      paginatedRequests.forEach(req => newSelected.add(req.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      paginatedRequests.forEach(req => newSelected.delete(req.id));
      setSelectedIds(newSelected);
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const renderDetails = (req: ScheduleRequest) => {
    if (req.type === 'change') {
      return (
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
                const prefix = req.details.dates.length === 2 ? (i === 0 ? 'From:' : 'To:') : 'To:';
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
      );
    } else if (req.type === 'swap') {
      return (
        <div className="flex flex-col gap-2 mt-1">
          <div>
            <span className="font-semibold block mb-1">{req.requester_firstName} gives:</span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {req.details.requesterDates?.map(d => (
                <div key={d.date} className="text-gray-900 dark:text-gray-100">
                  {formatDateLine(d)}
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="font-semibold block mb-1">{req.target_firstName} gives:</span>
            <div className="flex flex-col gap-1 text-sm pl-2">
              {req.details.targetDates?.map(d => (
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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading requests...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Schedule Requests</h2>
      
      <RequestFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        dateFilterType={dateFilterType}
        onDateFilterTypeChange={setDateFilterType}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      {user?.role === 'Developer' && selectedIds.size > 0 && (
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
                {user?.role === 'Developer' && (
                  <th className="px-4 py-4 w-12">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={paginatedRequests.length > 0 && paginatedRequests.every(req => selectedIds.has(req.id))}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className="px-6 py-4 font-medium">Requester</th>
                <th className="px-6 py-4 font-medium">Details</th>
                <th className="px-6 py-4 font-medium">Reason</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedRequests.map(req => (
                <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {user?.role === 'Developer' && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedIds.has(req.id)}
                        onChange={(e) => handleSelectRow(req.id, e.target.checked)}
                      />
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {req.requester_firstName} {req.requester_lastName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </div>
                    {req.type === 'swap' && (
                      <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                        Swap with: {req.target_firstName} {req.target_lastName}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {renderDetails(req)}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate" title={req.reason}>
                    {req.reason}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {req.type === 'swap' && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-500 w-12">Target:</span>
                          <span className={`font-medium ${
                            req.target_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                            req.target_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                            'text-orange-500'
                          }`}>
                            {req.target_status?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-500 w-12">Admin:</span>
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
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                        "{req.admin_remark}"
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {req.admin_status === 'pending' && (
                        req.type !== 'swap' || req.target_status === 'accepted'
                      ) ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleAction(req.id, 'accepted', '')}
                            disabled={processingId !== null}
                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md transition-colors disabled:opacity-50"
                            title="Accept"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setDenyRequestId(req.id);
                              setRemark('');
                              setDenyModalOpen(true);
                            }}
                            disabled={processingId !== null}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50"
                            title="Deny"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                          {req.admin_status !== 'pending' ? 'Resolved' : 'Waiting on target'}
                        </span>
                      )}

                      {/* Developer actions */}
                      {user?.role === 'Developer' && (
                        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
                          <button
                            onClick={() => req.type === 'change' ? setEditingChange(req) : setEditingSwap(req)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                            title="Edit Request"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {deleteConfirmId === req.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600 font-medium">Sure?</span>
                              <button onClick={() => handleDelete(req.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                                <X className="w-4 h-4" />
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
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={user?.role === 'Developer' ? 6 : 5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No schedule requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {filteredRequests.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredRequests.length / rowsPerPage)}
            onPageChange={setCurrentPage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={setRowsPerPage}
            totalItems={filteredRequests.length}
          />
        )}
      </div>

      {denyModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Deny Request</h2>
              <button onClick={() => setDenyModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason for denial
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Enter remarks..."
                autoFocus
              />
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setDenyModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (denyRequestId) {
                      handleAction(denyRequestId, 'denied', remark);
                      setDenyModalOpen(false);
                    }
                  }}
                  disabled={!remark.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Deny Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingChange && (
        <RequestChangeModal
          onClose={() => setEditingChange(null)}
          onSuccess={fetchRequests}
          dayDataMap={{}} // Pass empty dayDataMap
          editRequest={editingChange}
        />
      )}
      {editingSwap && (
        <SwapScheduleModal
          onClose={() => setEditingSwap(null)}
          onSuccess={fetchRequests}
          dayDataMap={{}} // Pass empty dayDataMap
          editRequest={editingSwap}
        />
      )}
    </div>
  );
}
