/**
 * App chrome — ported from the product's dbsync Layout (the image-4 sidebar),
 * re-pointed to the framework: auth from the fb_session store, the "Admin Tools"
 * section gated by role === 'master_admin' (framework roles: master_admin /
 * tenant_admin / owner — no is_master flag, no cloud/self-host edition split).
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    Database, LayoutDashboard, Menu, X, Settings, FileText, Users, HardDrive,
    Workflow, Server, LogOut, Shield, Layers,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/pages', label: 'Builder Studio', icon: FileText },
    { path: '/data-studio', label: 'Data Studio', icon: Database },
    { path: '/users', label: 'App Users', icon: Users },
    { path: '/storage', label: 'File Storage', icon: HardDrive },
    { path: '/automations', label: 'Automations', icon: Workflow },
    { path: '/edge', label: 'Edge Resources', icon: Server },
    { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const isMaster = user?.role === 'master_admin';

    const onLogout = async () => { await logout(); navigate('/login'); };

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {sidebarOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            <aside className={`
                fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground
                transform transition-transform duration-200 lg:static
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                            </svg>
                        </div>
                        <span className="text-lg font-bold">Frontbase</span>
                    </div>
                    <button className="rounded p-1 hover:bg-sidebar-accent lg:hidden" onClick={() => setSidebarOpen(false)}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `
                                flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors
                                ${isActive
                                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                }`}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <item.icon className="h-5 w-5" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}

                    {isMaster && (
                        <div className="mt-4 border-t border-sidebar-border pt-4">
                            <span className="mb-2 block px-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Admin Tools
                            </span>
                            <NavLink
                                to="/tenants"
                                className={({ isActive }) => `
                                    flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors
                                    ${isActive
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                    }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <Shield className="h-5 w-5 text-amber-500" />
                                <span>Tenants</span>
                            </NavLink>
                            <NavLink
                                to="/plans"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                                onClick={() => setSidebarOpen(false)}
                            >
                                <Layers className="h-5 w-5 text-amber-500" />
                                <span>Plans</span>
                            </NavLink>
                        </div>
                    )}
                </nav>

                <div className="mt-auto border-t border-sidebar-border p-4">
                    <div className="mb-2 truncate px-4 text-xs text-muted-foreground">{user?.email ?? ''}</div>
                    <button
                        onClick={onLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                        <LogOut className="h-5 w-5" />
                        Log Out
                    </button>
                </div>
            </aside>

            <div className="flex flex-1 flex-col overflow-hidden">
                <header className="flex items-center justify-between border-b bg-background p-4 lg:hidden">
                    <span className="font-bold">Frontbase</span>
                    <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-accent">
                        <Menu className="h-6 w-6" />
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
