import React from 'react';

export interface CardProps {
  className?: string;
}

export const Card = ({ children, className = "" }: React.PropsWithChildren<CardProps>) => {
  return (
    <div className={`apple-card p-6 ${className}`}>
      {children}
    </div>
  );
};