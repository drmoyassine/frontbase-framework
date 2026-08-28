import React from 'react';
import { Sidebar, SidebarContent, SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <>
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-h-screen max-w-full">
        <DashboardHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ maxWidth: '82.5vw' }}>
          {children}
        </main>
      </div>
    </>
  );
};