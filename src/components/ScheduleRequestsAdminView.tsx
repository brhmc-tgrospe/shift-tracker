import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ScheduleRequest } from '../types';
import { RequestActionCard } from './RequestActionCard';
import { Check, X, Clock, Pencil, Trash2, Users, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { RequestFilters } from './RequestFilters';
import { Pagination } from './Pagination';
import { RequestChangeModal } from './RequestChangeModal';
import { SwapScheduleModal } from './SwapScheduleModal';
import { useModal } from '../context/ModalContext';
import { UserScheduleOverviewModal } from './UserScheduleOverviewModal';
import { RequestDetailsModal } from './RequestDetailsModal';

export function ScheduleRequestsAdminView() {
  const { token, user } = useAuth();
  const modal = useModal();
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);


  const [editingChange, setEditingChange] = useState<ScheduleRequest | null>(null);
  const [editingSwap, setEditingSwap] = useState<ScheduleRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<ScheduleRequest | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);

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



  if (loading) return <div className="p-8 text-center text-gray-500">Loading requests...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Schedule Requests</h2>
        <button
          onClick={() => setIsOverviewModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition-colors font-medium text-sm"
        >
          <Users className="w-4 h-4" />
          View Schedules
        </button>
      </div>
      
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
                    <RequestActionCard request={req} token={token} onActionComplete={fetchRequests} />
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


                      {/* View Action for all Admin/Devs */}
                      <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
                        <button
                          onClick={() => setViewingRequest(req)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                          title="View Request"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>

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
      {viewingRequest && (
        <RequestDetailsModal 
          request={viewingRequest}
          onClose={() => setViewingRequest(null)}
        />
      )}
      {isOverviewModalOpen && (
        <UserScheduleOverviewModal onClose={() => setIsOverviewModalOpen(false)} showTotalHours={true} />
      )}
    </div>
  );
}
