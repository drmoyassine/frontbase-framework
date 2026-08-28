import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Database, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const tabs = [
    { path: 'datasources', label: 'Datasources', icon: Database },
]

export function DataStudio() {
    const location = useLocation();
    const isOnDatasources = location.pathname.includes('datasources');

    // Dispatch custom event to trigger datasource modal
    const handleAddDatasource = () => {
        window.dispatchEvent(new CustomEvent('open-datasource-modal'));
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Data Studio</h2>
                    <p className="text-muted-foreground">Manage your data sources, synchronizations, and integrity.</p>
                </div>
                {isOnDatasources && (
                    <Button onClick={handleAddDatasource}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Data Source
                    </Button>
                )}
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            className={({ isActive }) => `
                                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                                ${isActive
                                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }
                            `}
                        >
                            <tab.icon className={`
                                -ml-0.5 mr-2 h-5 w-5
                                ${location.pathname.includes(tab.path) ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}
                            `} />
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
                <Outlet />
            </div>
        </div>
    )
}

export default DataStudio

