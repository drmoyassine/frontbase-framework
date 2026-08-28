import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Database, Zap, Users } from 'lucide-react'
import { datasourcesApi } from '../api'
import { getPages } from '@/services/pages-api'
import { useWorkflowDrafts } from '@/stores/actions'
import { useUserStats } from '@/hooks/useUserStats'
import { cn } from '@/lib/utils'
import {
    PagesContentPanel,
    DataSourcesContentPanel,
    AutomationsContentPanel,
    UsersContentPanel
} from '../components/dashboard'

type DashboardSection = 'pages' | 'datasources' | 'automations' | 'users';

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: number;
    color: string;
    isActive: boolean;
    onClick: () => void;
}

function StatCard({ icon: Icon, label, value, color, isActive, onClick }: StatCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 transition-all duration-200 cursor-pointer hover-lift",
                isActive
                    ? "border-primary ring-2 ring-primary/20 scale-[1.02]"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            )}
        >
            <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-lg", color)}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                </div>
            </div>
        </div>
    );
}

export function Dashboard() {
    const [activeSection, setActiveSection] = useState<DashboardSection>('pages');

    // Fetch data for stats
    const { data: pages } = useQuery({
        queryKey: ['pages'],
        queryFn: () => getPages(false),
    });

    const { data: datasources } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    });

    const { data: workflowData } = useWorkflowDrafts();
    const { totalUsers } = useUserStats();

    const stats = [
        {
            id: 'pages' as const,
            label: 'Pages',
            value: Array.isArray(pages) ? pages.filter(p => p.isPublic).length : 0,
            icon: FileText,
            color: 'bg-blue-500',
        },
        {
            id: 'datasources' as const,
            label: 'Data Sources',
            value: datasources?.length || 0,
            icon: Database,
            color: 'bg-green-500',
        },
        {
            id: 'automations' as const,
            label: 'Automations',
            value: workflowData?.drafts?.length || 0,
            icon: Zap,
            color: 'bg-purple-500',
        },
        {
            id: 'users' as const,
            label: 'Users',
            value: totalUsers || 0,
            icon: Users,
            color: 'bg-orange-500',
        },
    ];

    const renderContent = () => {
        switch (activeSection) {
            case 'pages':
                return <PagesContentPanel />;
            case 'datasources':
                return <DataSourcesContentPanel />;
            case 'automations':
                return <AutomationsContentPanel />;
            case 'users':
                return <UsersContentPanel />;
            default:
                return <PagesContentPanel />;
        }
    };

    const getSectionTitle = () => {
        switch (activeSection) {
            case 'pages':
                return { title: 'Pages', description: 'Manage your published and draft pages' };
            case 'datasources':
                return { title: 'Data Sources', description: 'Connected databases and APIs' };
            case 'automations':
                return { title: 'Automations', description: 'Workflow automations and triggers' };
            case 'users':
                return { title: 'Users', description: 'User management and authentication' };
        }
    };

    const sectionInfo = getSectionTitle();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground">Overview of your project</p>
            </div>

            {/* Clickable Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <StatCard
                        key={stat.id}
                        icon={stat.icon}
                        label={stat.label}
                        value={stat.value}
                        color={stat.color}
                        isActive={activeSection === stat.id}
                        onClick={() => setActiveSection(stat.id)}
                    />
                ))}
            </div>

            {/* Section Header */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold">{sectionInfo.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{sectionInfo.description}</p>
            </div>

            {/* Dynamic Content Panel */}
            <div className="min-h-[400px]">
                {renderContent()}
            </div>
        </div>
    );
}
