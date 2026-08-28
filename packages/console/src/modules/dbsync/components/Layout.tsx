import { Outlet, NavLink } from 'react-router-dom'
import {
    Database,
    LayoutDashboard,
    Menu,
    X,
    Settings,
    FileText,
    Users,
    HardDrive,
    Workflow,
    Server,
    LogOut,
    Shield,
    Layers,
    Bot
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useAuth } from '@/lib/auth/useAuth'
import { isCloud } from '@/lib/edition'

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/pages', label: 'Builder Studio', icon: FileText },
    { path: '/data-studio', label: 'Data Studio', icon: Database },
    { path: '/users', label: 'App Users', icon: Users },
    { path: '/storage', label: 'File Storage', icon: HardDrive },
    { path: '/automations', label: 'Automations', icon: Workflow },
    { path: '/edge', label: 'Edge Resources', icon: Server },
    { path: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { user, _realUser } = useAuthStore()
    const { logout } = useAuth()
    
    const isMaster = user?.is_master || _realUser?.is_master
    const showAdminTools = isCloud() && isMaster

    return (
        <div className="h-screen flex overflow-hidden bg-white dark:bg-slate-900">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col
        w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                            </svg>
                        </div>
                        <span className="font-bold text-lg">Frontbase</span>
                    </div>
                    <button
                        className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                                ${isActive
                                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 font-medium'
                                }
                            `}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}

                    {/* Admin Tools Gated Category */}
                    {showAdminTools && (
                        <div className="pt-4 mt-4 border-t border-gray-255 dark:border-gray-700">
                            <span className="px-4 text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                                Admin Tools
                            </span>
                            <NavLink
                                to="/admin/tenants"
                                className={({ isActive }) => `
                                    flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                                    ${isActive
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                        : 'text-gray-650 hover:bg-gray-100 dark:text-gray-450 dark:hover:bg-gray-700 font-medium'
                                    }
                                `}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <Shield className="w-5 h-5 text-amber-500" />
                                <span className="font-medium">Tenants Table</span>
                            </NavLink>
                            <NavLink
                                to="/admin/plans"
                                className={({ isActive }) => `
                                    flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                                    ${isActive
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                        : 'text-gray-650 hover:bg-gray-100 dark:text-gray-450 dark:hover:bg-gray-700 font-medium'
                                    }
                                `}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <Layers className="w-5 h-5 text-amber-500" />
                                <span className="font-medium">Subscription Plans</span>
                            </NavLink>
                        </div>
                    )}
                </nav>

                {/* Bottom Actions */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
                    <button
                        onClick={async () => await logout()}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 font-medium"
                    >
                        <LogOut className="w-5 h-5" />
                        Log Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile header */}
                <header className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex items-center gap-2">
                        <Database className="w-6 h-6 text-primary" />
                        <span className="font-bold">Database Sync</span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -mr-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
