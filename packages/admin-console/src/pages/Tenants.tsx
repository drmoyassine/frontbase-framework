import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type TenantSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface Created { tenant: { slug: string; name: string }; admin: { email: string; tempPassword: string } }

export function Tenants() {
    const [tenants, setTenants] = useState<TenantSummary[]>([]);
    const [name, setName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [created, setCreated] = useState<Created | null>(null);

    const load = () => api<{ tenants: TenantSummary[] }>('/tenants')
        .then((r) => setTenants(r.tenants ?? []))
        .catch(() => setTenants([]));

    useEffect(() => { load(); }, []);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true); setMsg(null); setCreated(null);
        try {
            const r = await api<Created>('/tenants', { method: 'POST', body: JSON.stringify({ name, adminEmail }) });
            setCreated(r);
            setName(''); setAdminEmail('');
            await load();
        } catch (err) {
            setMsg({ kind: 'err', text: err instanceof ApiError ? err.code : 'failed' });
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Tenants</h1>
                <p className="text-muted-foreground">Provision tenants and their admins (master_admin only).</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <Card>
                    <CardHeader><CardTitle className="text-sm">All tenants</CardTitle></CardHeader>
                    <CardContent>
                        {tenants.length === 0
                            ? <p className="text-sm text-muted-foreground">No tenants yet.</p>
                            : <table className="w-full text-sm">
                                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Slug</th><th>Name</th><th>Created</th></tr></thead>
                                <tbody>
                                    {tenants.map((t) => (
                                        <tr key={t.slug} className="border-b last:border-0">
                                            <td className="py-2 font-mono">{t.slug}</td>
                                            <td>{t.name}</td>
                                            <td className="text-muted-foreground">{t.createdAt ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Create tenant</CardTitle>
                        <CardDescription>Seeds a tenant_admin with a one-time temp password.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-3">
                            <div className="space-y-1">
                                <Label htmlFor="t-name">Tenant name</Label>
                                <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="t-email">Admin email</Label>
                                <Input id="t-email" type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@acme.com" />
                            </div>
                            {msg && <Alert variant="destructive"><AlertTitle>{msg.text}</AlertTitle></Alert>}
                            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create tenant'}</Button>
                        </form>

                        {created && (
                            <Alert className="mt-4">
                                <div className="flex items-center justify-between">
                                    <AlertTitle>Created {created.tenant.name} <Badge variant="secondary" className="ml-1">{created.tenant.slug}</Badge></AlertTitle>
                                    <button className="text-xs text-primary hover:underline"
                                        onClick={() => navigator.clipboard?.writeText(created.admin.tempPassword)}>copy</button>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Admin: {created.admin.email}</p>
                                <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-xs">{created.admin.tempPassword}</code>
                                <p className="mt-1 text-[11px] text-muted-foreground">Shown once — store it now.</p>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
