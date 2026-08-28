import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FileText,
  Database,
  Users,
  HardDrive,
  Settings,
  Palette,
  Server,
  Workflow
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

const menuItems = [
  { title: 'Builder Studio', url: '/pages', icon: FileText },
  { title: 'Database', url: '/data-studio', icon: Database },
  { title: 'App Users', url: '/users', icon: Users },
  { title: 'File Storage', url: '/storage', icon: HardDrive },
  { title: 'Automations', url: '/automations', icon: Workflow },
  { title: 'Edge Resources', url: '/edge', icon: Server },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export const DashboardSidebar: React.FC = () => {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === 'collapsed';

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-muted text-primary font-medium" : "hover:bg-muted/50";

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            {!collapsed && <span>Frontbase</span>}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};