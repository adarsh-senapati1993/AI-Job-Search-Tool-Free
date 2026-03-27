import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
  type?: string;
  placeholder?: string;
  value?: string | number | readonly string[];
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export const Input = ({ label, error, className = "", ...props }: InputProps) => {
  return (
    <div className="space-y-1 w-full">
      {label && <label className="text-sm font-medium text-[#1D1D1F] dark:text-slate-300 block">{label}</label>}
      <input 
        className={`w-full bg-[#F5F5F7] dark:bg-slate-900 border ${error ? 'border-red-500' : 'border-transparent dark:border-slate-700'} rounded-lg px-4 py-2 text-[#1D1D1F] dark:text-white placeholder-[#86868B] dark:placeholder-slate-500 focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/20 dark:focus:ring-indigo-500 dark:focus:ring-2 dark:focus:bg-slate-900 transition-all ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};