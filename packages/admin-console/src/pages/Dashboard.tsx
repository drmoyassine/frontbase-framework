import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Database, Workflow, Users } from 'lucide-react';
import { api, type PageSummary } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function MetricCard({ icon: Icon, label, value, soon }: { icon: typeof FileText; label: string; value: string; soon?: boolean }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {label}{soon && <Badge variant="secondary" className="text-[10px]">soon</Badge>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function Dashboard() {
    const { user } = useAuthStore();
    const [pages, setPages] = useState<PageSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api<{ pages: PageSummary[] }>('/pages')
            .then((r) => setPages(r.pages ?? []))
            .catch(() => setPages([]))
            .finally(() => setLoading(false));
    }, []);

    const published = pages.filter((p) => (p.version ?? 0) > 0).length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Overview of your project{user?.email ? ` · ${user.email}` : ''}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon={FileText} label="Pages" value={loading ? '…' : String(pages.length)} />
                <MetricCard icon={Database} label="Data Sources" value="—" soon />
                <MetricCard icon={Workflow} label="Automations" value="—" soon />
                <MetricCard icon={Users} label="Users" value="—" soon />
            </div>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Pages</CardTitle>
                        <CardDescription>Manage your published and draft pages</CardDescription>
                    </div>
                    <Link to="/pages" className="text-sm font-medium text-primary hover:underline">Manage Pages →</Link>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <MetricCard icon={FileText} label="Published" value={loading ? '…' : String(published)} />
                        <MetricCard icon={FileText} label="Drafts" value={loading ? '…' : String(pages.length - published)} />
                        <MetricCard icon={FileText} label="Total" value={loading ? '…' : String(pages.length)} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
