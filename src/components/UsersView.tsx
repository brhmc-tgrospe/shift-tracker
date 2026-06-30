import React, { useEffect, useState } from 'react';
import { useAuth, User } from '../context/AuthContext';
import { Trash2, Edit2, Plus, Search, VenetianMask } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Department } from '../types';

export function UsersView() {
  const { token, user, login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<Partial<User> & { password?: string } | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} user(s)?`)) return;

    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(async res => {
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Failed to delete user');
            }
          })
        )
      );
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleImpersonate = async (targetUserId: number) => {
    try {
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ userId: targetUserId })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to impersonate');
      }

      const data = await res.json();
      if (token) {
        localStorage.setItem('devToken', token);
      }
      login(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSave = async () => {
    if (!editingUser) return;
    
    const isNew = !editingUser.id;
    const url = isNew ? '/api/users' : `/api/users/${editingUser.id}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(editingUser)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(filteredUsers.filter(u => canModify(u)).map(u => u.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectUser = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const canModify = (targetUser: User) => {
    if (user?.role === 'Developer') return true;
    if (user?.role === 'Admin') {
      return targetUser.role !== 'Developer' && targetUser.role !== 'Admin';
    }
    return false;
  };

  const canImpersonate = (targetUser: User) => {
    if (user?.role === 'Developer') return targetUser.role !== 'Developer';
    return false;
  };

  const filteredUsers = users.filter(u => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      u.username.toLowerCase().includes(query) || 
      u.firstName.toLowerCase().includes(query) || 
      u.lastName.toLowerCase().includes(query) ||
      (u.department_name && u.department_name.toLowerCase().includes(query));
      
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 border border-red-100 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Management</h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-grow sm:flex-grow-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white w-full sm:w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <select
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All">All Roles</option>
            <option value="User">User</option>
            <option value="Admin">Admin</option>
            <option value="Developer">Developer</option>
          </select>

          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete ({selectedIds.size})
            </button>
          )}

          <button
            onClick={() => setEditingUser({ username: '', email: '', firstName: '', lastName: '', role: 'User' })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left w-12">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={filteredUsers.filter(u => canModify(u)).length > 0 && selectedIds.size === filteredUsers.filter(u => canModify(u)).length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelectUser(u.id)}
                        disabled={u.id === user?.id || !canModify(u)} 
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-300 font-bold transition-colors">
                          {u.firstName[0]}{u.lastName[0]}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{u.firstName} {u.lastName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{u.email} ({u.username})</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {u.department_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        u.role === 'Developer' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' : 
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
                          
                          {u.id !== user?.id && (
                            <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors mr-4">
                              <Trash2 className="w-4 h-4 inline" /> <span className="sr-only">Delete</span>
                            </button>
                          )}
                        </>
                      )}
                      
                      {canImpersonate(u) && (
                        <button onClick={() => handleImpersonate(u.id)} className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 transition-colors" title="Impersonate User">
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

      {/* Modal for editing/creating user */}
      {editingUser && (
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
                    onChange={e => setEditingUser({...editingUser, firstName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                    value={editingUser.lastName}
                    onChange={e => setEditingUser({...editingUser, lastName: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                  value={editingUser.username}
                  onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                  value={editingUser.email}
                  onChange={e => setEditingUser({...editingUser, email: e.target.value})}
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
                  onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                  value={editingUser.department_id || ''}
                  onChange={e => setEditingUser({...editingUser, department_id: e.target.value ? Number(e.target.value) : undefined})}
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
                  onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                  disabled={user?.role === 'Admin'} 
                >
                  <option value="User">User</option>
                  {user?.role === 'Developer' && (
                    <>
                      <option value="Admin">Admin</option>
                      <option value="Developer">Developer</option>
                    </>
                  )}
                </select>
              </div>
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
      )}
    </div>
  );
}
