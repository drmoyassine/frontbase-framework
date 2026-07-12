/**
 * Plans — billing-tier management.
 * Phase 3b / F8. CRUD over /api/console/plans. Limits edited as JSON.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, CreditCard } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
    price_cents: number;
    interval: string;
    limits: Record<string, number> | null;
    is_active: number | boolean;
}

const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function Plans() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [form, setForm] = useState({ id: '', name: '', priceCents: 0, interval: 'month', limits: '{\n  "pages": 10\n}' });
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const load = () => api<{ plans: Plan[] }>('/plans').then((r) => setPlans(r.plans ?? [])).catch(() => setPlans([]));
    useEffect(() => { load(); }, []);

    const startNew = () => { setEditing(null); setForm({ id: '', name: '', priceCents: 0, interval: 'month', limits: '{\n  "pages": 10\n}' }); setShowForm(true); };
    const startEdit = (p: Plan) => {
        setEditing(p.id);
        setForm({ id: p.id, name: p.name, priceCents: p.price_cents, interval: p.interval, limits: p.limits ? JSON.stringify(p.limits, null, 2) : '{}' });
        setShowForm(true);
    };

    const save = async () => {
        if (!form.id || !form.name) { setMsg({ kind: 'err', text: 'ID + name required' }); return; }
        let limits: Record<string, number> | undefined;
        try { limits = form.limits.trim() ? JSON.parse(form.limits) : undefined; }
        catch { setMsg({ kind: 'err', text: 'Limits must be valid JSON' }); return; }
        setMsg(null);
        try {
            await api(`/plans/${form.id}`, { method: 'PUT', body: JSON.stringify({ name: form.name, priceCents: form.priceCents, interval: form.interval, limits }) });
            setShowForm(false); setEditing(null);
            await load();
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' }); }
    };

    const remove = async (id: string) => { await api(`/plans/${id}`, { method: 'DELETE' }); await load(); };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Plans</h1>
                    <p className="text-muted-foreground">Billing tiers and feature limits.</p>
                </div>
                <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" />New plan</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            {showForm && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">{editing ? 'Edit plan' : 'New plan'}</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <div><Label className="text-xs">ID</Label><Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} disabled={!!editing} placeholder="starter" /></div>
                        <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div><Label className="text-xs">Price (cents)</Label><Input type="number" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })} placeholder="1900 = $19.00" /></div>
                        <div>
                            <Label className="text-xs">Interval</Label>
                            <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                <option value="month">Monthly</option>
                                <option value="year">Yearly</option>
                                <option value="one_time">One-time</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <Label className="text-xs">Limits (JSON — use -1 for unlimited)</Label>
                            <textarea value={form.limits} onChange={(e) => setForm({ ...form, limits: e.target.value })} spellCheck={false} className="mt-1 h-32 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" />
                        </div>
                        <div className="md:col-span-2 flex gap-2"><Button onClick={save}>{editing ? 'Update' : 'Create'}</Button><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plans.length === 0 && !showForm && <p className="text-sm text-muted-foreground">No plans yet.</p>}
                {plans.map((p) => (
                    <Card key={p.id}>
                        <CardHeader className="flex-row items-center justify-between">
                            <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /><CardTitle className="text-sm">{p.name}</CardTitle></div>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                                <Button variant="ghost" size="sm" onClick={() => remove(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="text-2xl font-bold">{fmtPrice(p.price_cents)}<span className="text-sm font-normal text-muted-foreground">/{p.interval}</span></div>
                            <div className="flex flex-wrap gap-1">
                                {p.limits && Object.entries(p.limits).map(([k, v]) => (
                                    <Badge key={k} variant="outline" className="text-[10px]">{k}: {v === -1 ? '∞' : v}</Badge>
                                ))}
                                {!p.limits && <span className="text-xs text-muted-foreground">No limits set</span>}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
