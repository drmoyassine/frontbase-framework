import React from 'react';
import { AdminApp } from '@/components/admin/AdminApp';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

export const AdminPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="p-6">
        <AdminApp />
      </div>
    </DashboardLayout>
  );
};