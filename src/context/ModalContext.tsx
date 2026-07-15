import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AlertCircle, HelpCircle } from 'lucide-react';

type ModalType = 'confirm' | 'alert';

interface ModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

interface ModalContextType {
  confirm: (options: ModalOptions | string) => Promise<boolean>;
  alert: (options: ModalOptions | string) => Promise<void>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<ModalType>('confirm');
  const [options, setOptions] = useState<ModalOptions>({ message: '' });
  const [resolveFn, setResolveFn] = useState<((value: boolean | void) => void) | null>(null);

  const confirm = (opts: ModalOptions | string): Promise<boolean> => {
    const defaultOptions = typeof opts === 'string' ? { message: opts, title: 'Confirm' } : { title: 'Confirm', ...opts };
    setOptions(defaultOptions);
    setType('confirm');
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolveFn(() => resolve);
    });
  };

  const alert = (opts: ModalOptions | string): Promise<void> => {
    const defaultOptions = typeof opts === 'string' ? { message: opts, title: 'Alert' } : { title: 'Alert', ...opts };
    setOptions(defaultOptions);
    setType('alert');
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolveFn(() => resolve);
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolveFn) {
      if (type === 'confirm') (resolveFn as (value: boolean) => void)(true);
      else (resolveFn as (value: void) => void)();
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolveFn && type === 'confirm') {
      (resolveFn as (value: boolean) => void)(false);
    }
  };

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 bg-gray-500/50 dark:bg-gray-900/60 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              {type === 'confirm' ? (
                <HelpCircle className="w-6 h-6 text-indigo-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-500" />
              )}
              <h4 className="font-medium text-lg text-gray-900 dark:text-white">
                {options.title}
              </h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {options.message}
            </p>
            <div className="flex gap-3 justify-end">
              {type === 'confirm' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                >
                  {options.cancelText || 'Cancel'}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors ${
                  type === 'confirm' 
                    ? 'bg-indigo-600 hover:bg-indigo-700' 
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {options.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
