import React from 'react';
import { ScheduleRequest } from '../types';
import { X } from 'lucide-react';
import { RequestActionCard } from './RequestActionCard';

interface RequestDetailsModalProps {
  request: ScheduleRequest;
  onClose: () => void;
}

export function RequestDetailsModal({ request, onClose }: RequestDetailsModalProps) {


  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg overflow-visible flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Request Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Requester
              </label>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {request.requester_firstName} {request.requester_lastName}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Date Submitted
              </label>
              <div className="text-sm text-gray-900 dark:text-white">
                {new Date(request.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {request.type === 'swap' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Target User
              </label>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {request.target_firstName} {request.target_lastName}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Details
            </label>
            <RequestActionCard request={request} token={null} showActions={false} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Reason
            </label>
            <div className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md whitespace-pre-wrap">
              {request.reason}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            {request.type === 'swap' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Target Status
                </label>
                <div className={`text-sm font-medium ${
                  request.target_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                  request.target_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                  'text-orange-500'
                }`}>
                  {request.target_status?.toUpperCase()}
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Admin Status
              </label>
              <div className={`text-sm font-medium ${
                request.admin_status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                request.admin_status === 'denied' ? 'text-red-600 dark:text-red-400' :
                'text-orange-500'
              }`}>
                {request.admin_status.toUpperCase()}
              </div>
            </div>
          </div>

          {request.admin_remark && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Admin Remark
              </label>
              <div className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md italic">
                {request.admin_remark}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded-lg transition-colors font-medium text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
