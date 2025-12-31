import React, { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  duration?: number;
}

let toastListeners: ((toast: ToastMessage) => void)[] = [];

// Global function to trigger toasts safely
if (typeof window !== 'undefined') {
    (window as any).showToast = (toast: Omit<ToastMessage, 'id'>) => {
        const toastWithId = {
            ...toast,
            id: `toast-${Date.now()}-${Math.random()}`,
            duration: toast.duration || 3000
        };
        toastListeners.forEach(listener => listener(toastWithId));
    };
}

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  
  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts(prev => [...prev, toast]);
      
      // Auto-dismiss
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, toast.duration || 3000);
    };
    
    toastListeners.push(listener);
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);
  
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg border backdrop-blur-md transition-all animate-in slide-in-from-right-5 fade-in duration-300 max-w-sm flex items-center gap-3 ${
            toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' :
            toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-100' :
            toast.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-100' :
            'bg-slate-800/90 border-slate-700 text-slate-100'
          }`}
        >
          <span className="text-lg">
            {toast.type === 'success' ? '✅' :
             toast.type === 'error' ? '❌' :
             toast.type === 'warning' ? '⏳' : 'ℹ️'}
          </span>
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ))}
    </div>
  );
};