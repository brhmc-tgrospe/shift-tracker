import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import { Department } from '../types';

export function DepartmentsView() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [editingDept, setEditingDept] = useState<Partial<Department> | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      const res = await fetch(`/api/departments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      fetchDepartments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSave = async () => {
    if (!editingDept || !editingDept.name) return;
    
    const isNew = !editingDept.id;
    const url = isNew ? '/api/departments' : `/api/departments/${editingDept.id}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(editingDept)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      
      setEditingDept(null);
      fetchDepartments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 border border-red-100 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-500" /> Departments
        </h2>
        
        <button
          onClick={() => setEditingDept({ name: '' })}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No departments found.
                  </td>
                </tr>
              ) : (
                departments.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {d.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {d.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button onClick={() => setEditingDept(d)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4 transition-colors">
                        <Edit2 className="w-4 h-4 inline" /> <span className="sr-only">Edit</span>
                      </button>
                      <button onClick={() => handleDelete(d.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors">
                        <Trash2 className="w-4 h-4 inline" /> <span className="sr-only">Delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for editing/creating department */}
      {editingDept && (
        <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">{editingDept.id ? 'Edit Department' : 'New Department'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white transition-colors"
                  value={editingDept.name}
                  onChange={e => setEditingDept({...editingDept, name: e.target.value})}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingDept(null)}
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
