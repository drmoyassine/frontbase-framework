/**
 * App Users — tenant-scoped user management.
 * CF-18 Phase 2. List / invite (temp password returned once) / update role / delete.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Copy, UserPlus } from 'lucide-react';

interface User {
    id: string;
    email: string;
    role: string;
    tenantSlug: string;
}

export function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('owner');
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const load = () => api<{ users: User[] }>('/users').then((r) => setUsers(r.users ?? [])).catch(() => setUsers([]));
    useEffect(() => { load(); }, []);

    const invite = async () => {
        if (!email) { setMsg({ kind: 'err', text: 'Email required' }); return; }
        setMsg(null);
        try {
            const { user, tempPassword: tp } = await api<{ user: User; tempPassword: string }>('/users', {
                method: 'POST',
                body: JSON.stringify({ email, role }),
            });
            setTempPassword(tp);
            setShowForm(false);
            setEmail(''); setRole('owner');
            await load();
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        }
    };

    const updateRole = async (id: string, newRole: string) => {
        try {
            await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
            await load();
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        }
    };

    const remove = async (id: string) => {
        await api(`/users/${id}`, { method: 'DELETE' });
        await load();
    };

    const copyPassword = () => {
        if (tempPassword) {
            navigator.clipboard.writeText(tempPassword);
            setMsg({ kind: 'ok', text: 'Copied to clipboard' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">App Users</h1>
                    <p className="text-muted-foreground">Manage users in your tenant.</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}><UserPlus className="mr-2 h-4 w-4" />Invite</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            {tempPassword && (
                <Card className="border-primary">
                    <CardHeader><CardTitle className="text-sm">Temp password (shown once)</CardTitle></CardHeader>
                    <CardContent className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{tempPassword}</code>
                        <Button variant="outline" size="sm" onClick={copyPassword}><Copy className="mr-1 h-3 w-3" />Copy</Button>
                        <Button variant="ghost" size="sm" onClick={() => setTempPassword(null)}>Dismiss</Button>
                    </CardContent>
                </Card>
            )}

            {showForm && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">Invite user</CardTitle></CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="flex-1" />
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="owner">Owner</option>
                            <option value="tenant_admin">Tenant Admin</option>
                        </select>
                        <Button onClick={invite}><Plus className="mr-1 h-3 w-3" />Invite</Button>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle className="text-sm">Users ({users.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                    {users.length === 0 && <p className="text-sm text-muted-foreground">No users.</p>}
                    {users.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <span className="flex-1 truncate">{u.email}</span>
                            <select
                                value={u.role}
                                onChange={(e) => updateRole(u.id, e.target.value)}
                                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                                <option value="owner">Owner</option>
                                <option value="tenant_admin">Admin</option>
                            </select>
                            <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => remove(u.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
