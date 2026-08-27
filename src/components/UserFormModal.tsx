import React from 'react';
import { User } from '../context/AuthContext';
import { Department } from '../types';

interface UserFormModalProps {
  editingUser: Partial<User> & { password?: string, reset_username_changed?: boolean };
  setEditingUser: (user: Partial<User> & { password?: string, reset_username_changed?: boolean } | null) => void;
  departments: Department[];
  currentUserRole: string | undefined;
  handleSave: () => void;
}

export function UserFormModal({ editingUser, setEditingUser, departments, currentUserRole, handleSave }: UserFormModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/80 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">{editingUser.id ? 'Edit User' : 'New User'}</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                value={editingUser.firstName}
                onChange={e => setEditingUser({ ...editingUser, firstName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                value={editingUser.lastName}
                onChange={e => setEditingUser({ ...editingUser, lastName: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.username}
              onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.email}
              onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {editingUser.id ? 'New Password (leave blank to keep)' : 'Password'}
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.password || ''}
              onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.gender || 'Male'}
              onChange={e => setEditingUser({ ...editingUser, gender: e.target.value as 'Male' | 'Female' })}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.department_id || ''}
              onChange={e => setEditingUser({ ...editingUser, department_id: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">No Department</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
              value={editingUser.role}
              onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
              disabled={currentUserRole === 'Admin'}
            >
              <option value="User">User</option>
              {currentUserRole === 'Developer' && (
                <>
                  <option value="Admin">Admin</option>
                  <option value="Developer">Developer</option>
                </>
              )}
            </select>
          </div>

          {editingUser.id && (currentUserRole === 'Admin' || currentUserRole === 'Developer') && (
            <div className="flex items-center mt-2">
              <input
                type="checkbox"
                id="reset_username_changed"
                checked={!!editingUser.reset_username_changed}
                onChange={e => setEditingUser({ ...editingUser, reset_username_changed: e.target.checked })}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="reset_username_changed" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                Reset one-time username change limit
              </label>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setEditingUser(null)}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
