import React, { useEffect, useState } from 'react';
import { useAuth, User } from '../context/AuthContext';
import { Trash2, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Department } from '../types';
import { UserFormModal } from './UserFormModal';
import { UsersTable } from './UsersTable';

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
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch users');
      setUsers(await res.json());
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch departments');
      setDepartments(await res.json());
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).error);
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
          fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).then(async res => {
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete user');
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: targetUserId })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to impersonate');
      
      const data = await res.json();
      if (token) localStorage.setItem('devToken', token);
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
    
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editingUser)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? new Set(filteredUsers.filter(u => canModify(u)).map(u => u.id)) : new Set());
  };

  const toggleSelectUser = (id: number) => {
    const newSet = new Set(selectedIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedIds(newSet);
  };

  const canModify = (targetUser: User) => {
    if (user?.role === 'Developer') return true;
    if (user?.role === 'Admin') return targetUser.role !== 'Developer' && targetUser.role !== 'Admin';
    return false;
  };

  const canImpersonate = (targetUser: User) => {
    if (user?.role === 'Developer') return targetUser.role !== 'Developer' && targetUser.role !== 'Admin';
    return false;
  };

  const filteredUsers = users.filter(u => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = u.username.toLowerCase().includes(query) ||
      u.firstName.toLowerCase().includes(query) ||
      u.lastName.toLowerCase().includes(query) ||
      (u.department_name && u.department_name.toLowerCase().includes(query));
    return matchesSearch && (roleFilter === 'All' || u.role === roleFilter);
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
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white w-full sm:w-64"
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

      <UsersTable
        filteredUsers={filteredUsers}
        selectedIds={selectedIds}
        currentUser={user}
        toggleSelectAll={toggleSelectAll}
        toggleSelectUser={toggleSelectUser}
        canModify={canModify}
        canImpersonate={canImpersonate}
        setEditingUser={setEditingUser}
        handleDelete={handleDelete}
        handleImpersonate={handleImpersonate}
      />

      {editingUser && (
        <UserFormModal
          editingUser={editingUser}
          setEditingUser={setEditingUser}
          departments={departments}
          currentUserRole={user?.role}
          handleSave={handleSave}
        />
      )}
    </div>
  );
}
