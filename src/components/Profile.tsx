import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Moon, Sun, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Profile() {
  const { user, token, updateUser } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: user?.username || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    currentPassword: '',
    password: '',
    confirmPassword: ''
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial dark mode state
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    setIsDarkMode(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password) {
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('New password and confirm password do not match.');
        return;
      }
      if (!formData.currentPassword) {
        setError('Current password is required to change password.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          ...(formData.password ? { password: formData.password, currentPassword: formData.currentPassword } : {})
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      updateUser(data);
      setSuccess('Profile updated successfully!');
      setFormData(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' })); // clear password fields
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100/50 dark:bg-gray-900 transition-colors py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors">

        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center shadow-sm text-white mb-4">
            <User className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Settings</h2>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 border border-red-100 dark:border-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm mb-6 border border-green-100 dark:border-green-800">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input
              type="text"
              name="username"
              disabled={user.username_changed}
              className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none transition-colors dark:text-white ${user.username_changed
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800'
                }`}
              value={formData.username}
              onChange={handleChange}
            />
            {user.username_changed && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">You have already changed your username once.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
              <input
                type="text"
                name="firstName"
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none transition-colors bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                value={formData.firstName}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
              <input
                type="text"
                name="lastName"
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none transition-colors bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                value={formData.lastName}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
            <input
              type="text"
              disabled
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none transition-colors bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
              value={(user as any).department_name || 'No Department'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              name="email"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors dark:bg-gray-800 dark:text-white"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Change Password</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  name="currentPassword"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors dark:bg-gray-800 dark:text-white pr-10"
                  value={formData.currentPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="password"
                  minLength={6}
                  placeholder="Leave blank to keep current"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors dark:bg-gray-800 dark:text-white pr-10"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors dark:bg-gray-800 dark:text-white pr-10"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors mt-2 disabled:opacity-70"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
