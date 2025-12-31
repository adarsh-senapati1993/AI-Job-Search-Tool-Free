import React from 'react';

export interface CardProps {
  className?: string;
}

export const Card = ({ children, className = "" }: React.PropsWithChildren<CardProps>) => {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-6 ${className}`}>
      {children}
    </div>
  );
};