import React from 'react';
import { Sidebar } from './Sidebar';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex bg-white font-serif text-gray-900 overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 w-full bg-white relative">
        {children}
      </main>
    </div>
  );
};
