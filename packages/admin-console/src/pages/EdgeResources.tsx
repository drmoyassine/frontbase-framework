/**
 * Edge Resources — manage engines, databases, caches, queues, vectors.
 * CF-18 Phase 2. CRUD over /api/console/edge-resources.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Database, Server, Layers, HardDrive, Zap } from 'lucide-react';

interface EdgeResource {
    id: string;
    kind: string;
    name: string;
    provider: string | null;
    config: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

const KINDS = [
    { kind: 'engine', label: 'Engine', icon: Server },
    { kind: 'database', label: 'Database', icon: Database },
    { kind: 'cache', label: 'Cache', icon: Zap },
    { kind: 'queue', label: 'Queue', icon: Layers },
    { kind: 'vector', label: 'Vector', icon: HardDrive },
];

export function EdgeResources() {
    const [resources, setResources] = useState<EdgeResource[]>([]);
    const [filter, setFilter] = useState<string>('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ id: '', kind: 'database', name: '', provider: '', config: '' });
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const load = () => api<{ resources: EdgeResource[] }>(`/edge-resources${filter ? `?kind=${filter}` : ''}`)
        .then((r) => setResources(r.resources ?? []))
        .catch(() => setResources([]));

    useEffect(() => { load(); }, [filter]);

    const save = async () => {
        if (!form.id || !form.name || !form.kind) { setMsg({ kind: 'err', text: 'ID, kind, name required' }); return; }
        setMsg(null);
        try {
            await api(`/edge-resources/${form.id}`, {
                method: 'PUT',
                body: JSON.stringify({ kind: form.kind, name: form.name, provider: form.provider || undefined, config: form.config || undefined }),
            });
            setMsg({ kind: 'ok', text: 'Created' });
            setShowForm(false);
            setForm({ id: '', kind: 'database', name: '', provider: '', config: '' });
            await load();
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        }
    };

    const remove = async (id: string) => {
        await api(`/edge-resources/${id}`, { method: 'DELETE' });
        await load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Edge Resources</h1>
                    <p className="text-muted-foreground">Manage engines, databases, caches, queues, vectors.</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4" />Add</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            {showForm && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">New resource</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <div><Label className="text-xs">ID</Label><Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="my-database" /></div>
                        <div>
                            <Label className="text-xs">Kind</Label>
                            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                            </select>
                        </div>
                        <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div><Label className="text-xs">Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="d1 / turso / supabase" /></div>
                        <div className="md:col-span-2"><Label className="text-xs">Config (JSON)</Label><Input value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} placeholder='{"url":"..."}' /></div>
                        <div className="md:col-span-2"><Button onClick={save}>Create resource</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="flex gap-2">
                <Button variant={filter === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('')}>All</Button>
                {KINDS.map((k) => (
                    <Button key={k.kind} variant={filter === k.kind ? 'default' : 'outline'} size="sm" onClick={() => setFilter(k.kind)}>{k.label}</Button>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {resources.length === 0 && <p className="text-sm text-muted-foreground">No resources yet.</p>}
                {resources.map((r) => {
                    const kindDef = KINDS.find((k) => k.kind === r.kind);
                    const Icon = kindDef?.icon ?? Server;
                    return (
                        <Card key={r.id}>
                            <CardHeader className="flex-row items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Icon className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-sm">{r.name}</CardTitle>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </CardHeader>
                            <CardContent className="space-y-1 text-xs text-muted-foreground">
                                <div>Kind: <Badge variant="outline" className="text-[10px]">{r.kind}</Badge></div>
                                <div>Provider: {r.provider || '—'}</div>
                                <div>Status: <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge></div>
                                <div className="truncate">ID: {r.id}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
