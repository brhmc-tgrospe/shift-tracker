import React, { useEffect, useState } from 'react';
import { useAuth, User } from '../context/AuthContext';
import { Trash2, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { Department } from '../types';
import { UserFormModal } from './UserFormModal';
import { UsersTable } from './UsersTable';
import toast from 'react-hot-toast';
import { useModal } from '../context/ModalContext';

export function UsersView() {
  const { token, user, login } = useAuth();
  const modal = useModal();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<Partial<User> & { password?: string, reset_username_changed?: boolean } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [sortBy, setSortBy] = useState('firstName');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [debouncedSearchQuery, roleFilter, departmentFilter, sortBy, sortDir]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.append('search', debouncedSearchQuery);
      if (roleFilter !== 'All') params.append('role', roleFilter);
      if (departmentFilter !== 'All') params.append('department', departmentFilter);
      params.append('sortBy', sortBy);
      params.append('sortDir', sortDir);

      const res = await fetch(`/api/users?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } });
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
    if (!(await modal.confirm('Are you sure you want to delete this user?'))) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await modal.confirm(`Are you sure you want to delete ${selectedIds.size} user(s)?`))) return;

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
      toast.error(err.message);
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
      toast.error(err.message);
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
      toast.error(err.message);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "username,email,password,firstName,lastName,role,department\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "user_import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch('/api/users/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ users: results.data })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to import users');
          
          let alertMsg = `Successfully imported ${data.success} users.`;
          if (data.errors && data.errors.length > 0) {
            alertMsg += `\n\nErrors encountered:\n${data.errors.join('\n')}`;
          }
          await modal.alert(alertMsg);
          fetchUsers();
          if (e.target) e.target.value = '';
        } catch (err: any) {
          toast.error(err.message);
        }
      },
      error: (error: any) => {
        toast.error('Failed to parse CSV: ' + error.message);
      }
    });

    e.target.value = '';
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? new Set(users.filter(u => canDelete(u)).map(u => u.id)) : new Set());
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

  const canDelete = (targetUser: User) => {
    if (targetUser.role === 'Developer') return false;
    if (user?.role === 'Developer') return true;
    if (user?.role === 'Admin') return targetUser.role !== 'Developer' && targetUser.role !== 'Admin';
    return false;
  };

  const canImpersonate = (targetUser: User) => {
    if (user?.role === 'Developer') return targetUser.role !== 'Developer' && targetUser.role !== 'Admin';
    return false;
  };



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

          <select
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors dark:bg-gray-800 dark:text-white"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="All">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete ({selectedIds.size})
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {/* <button
              onClick={handleDownloadTemplate}
              title={`Valid departments: ${departments.map(d => d.name).join(', ')}`}
              className="px-4 py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-lg text-sm font-medium transition-colors"
            >
              CSV Template
            </button>
            <label className="cursor-pointer px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label> */}
            <button
              onClick={() => setEditingUser({ username: '', email: '', firstName: '', lastName: '', role: 'User' })}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>
      </div>

      <UsersTable
        users={users}
        selectedIds={selectedIds}
        currentUser={user}
        toggleSelectAll={toggleSelectAll}
        toggleSelectUser={toggleSelectUser}
        canModify={canModify}
        canDelete={canDelete}
        canImpersonate={canImpersonate}
        setEditingUser={setEditingUser}
        handleDelete={handleDelete}
        handleImpersonate={handleImpersonate}
        sortBy={sortBy}
        sortDir={sortDir}
        setSortBy={setSortBy}
        setSortDir={setSortDir}
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
