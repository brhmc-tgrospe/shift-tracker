import React from 'react';
import { Trash2, Edit2, VenetianMask, ArrowUp, ArrowDown } from 'lucide-react';
import { User } from '../context/AuthContext';

interface UsersTableProps {
  users: User[];
  selectedIds: Set<number>;
  currentUser: User | null;
  toggleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleSelectUser: (id: number) => void;
  canModify: (targetUser: User) => boolean;
  canImpersonate: (targetUser: User) => boolean;
  setEditingUser: (user: Partial<User> & { password?: string, reset_username_changed?: boolean } | null) => void;
  handleDelete: (id: number) => void;
  handleImpersonate: (id: number) => void;
  sortBy: string;
  sortDir: string;
  setSortBy: (col: string) => void;
  setSortDir: (dir: string) => void;
}

export function UsersTable({
  users,
  selectedIds,
  currentUser,
  toggleSelectAll,
  toggleSelectUser,
  canModify,
  canImpersonate,
  setEditingUser,
  handleDelete,
  handleImpersonate,
  sortBy,
  sortDir,
  setSortBy,
  setSortDir
}: UsersTableProps) {
  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (col: string) => {
    if (sortBy !== col) return null;
    return sortDir === 'asc' ? <ArrowUp className="w-4 h-4 inline ml-1" /> : <ArrowDown className="w-4 h-4 inline ml-1" />;
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-6 py-3 text-left w-12">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={users.filter(u => canModify(u)).length > 0 && selectedIds.size === users.filter(u => canModify(u)).length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('firstName')}
              >
                First Name {renderSortIcon('firstName')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('lastName')}
              >
                Last Name {renderSortIcon('lastName')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelectUser(u.id)}
                      disabled={u.id === currentUser?.id || !canModify(u)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {u.firstName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {u.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">{u.username}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {u.department_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === 'Developer' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                        u.role === 'Admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {canModify(u) && (
                      <>
                        <button onClick={() => setEditingUser(u)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4 transition-colors">
                          <Edit2 className="w-4 h-4 inline" /> <span className="sr-only">Edit</span>
                        </button>

                        {u.id !== currentUser?.id && (
                          <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors mr-4">
                            <Trash2 className="w-4 h-4 inline" /> <span className="sr-only">Delete</span>
                          </button>
                        )}
                      </>
                    )}

                    {canImpersonate(u) && (
                      <button onClick={() => handleImpersonate(u.id)} className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 transition-colors" title="View">
                        <VenetianMask className="w-4 h-4 inline" /> <span className="sr-only">Impersonate</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
