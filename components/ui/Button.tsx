import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isLoading?: boolean;
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export const Button = ({ children, variant = 'primary', isLoading, className = "", disabled, ...props }: ButtonProps) => {
  const baseStyles = "px-5 py-2.5 rounded-full font-semibold transition-all duration-300 ease-out flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]";
  
  const variants = {
    primary: "bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-sm hover:shadow-md",
    secondary: "bg-slate-200/50 hover:bg-slate-200 text-slate-800 dark:bg-slate-700/50 dark:hover:bg-slate-700 dark:text-slate-100",
    outline: "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
    ghost: "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
      ) : null}
      {children}
    </button>
  );
};