/**
 * Settings — tenant-scoped key/value config + variables (env vars).
 * CF-18 Phase 2. CRUD over /api/console/settings and /api/console/variables.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Key, Settings as SettingsIcon } from 'lucide-react';

interface Setting { key: string; value: string; updated_at: string; }
interface Variable { key: string; value: string; is_secret: number | boolean; updated_at: string; }

export function Settings() {
    const [tab, setTab] = useState<'settings' | 'variables'>('settings');
    const [settings, setSettings] = useState<Setting[]>([]);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [isSecret, setIsSecret] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const load = () => {
        api<{ settings: Setting[] }>('/settings').then((r) => setSettings(r.settings ?? [])).catch(() => setSettings([]));
        api<{ variables: Variable[] }>('/variables').then((r) => setVariables(r.variables ?? [])).catch(() => setVariables([]));
    };

    useEffect(() => { load(); }, []);

    const addSetting = async () => {
        if (!newKey || !newValue) { setMsg({ kind: 'err', text: 'Key + value required' }); return; }
        setMsg(null);
        try {
            await api(`/settings/${newKey}`, { method: 'PUT', body: JSON.stringify({ value: newValue }) });
            setNewKey(''); setNewValue('');
            await load();
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' }); }
    };

    const addVariable = async () => {
        if (!newKey || !newValue) { setMsg({ kind: 'err', text: 'Key + value required' }); return; }
        setMsg(null);
        try {
            await api(`/variables/${newKey}`, { method: 'PUT', body: JSON.stringify({ value: newValue, isSecret }) });
            setNewKey(''); setNewValue(''); setIsSecret(false);
            await load();
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' }); }
    };

    const deleteSetting = async (key: string) => { await api(`/settings/${key}`, { method: 'DELETE' }); await load(); };
    const deleteVariable = async (key: string) => { await api(`/variables/${key}`, { method: 'DELETE' }); await load(); };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-muted-foreground">Tenant configuration and environment variables.</p>
            </div>

            <div className="flex gap-2">
                <Button variant={tab === 'settings' ? 'default' : 'outline'} size="sm" onClick={() => setTab('settings')}><SettingsIcon className="mr-1 h-3 w-3" />Settings</Button>
                <Button variant={tab === 'variables' ? 'default' : 'outline'} size="sm" onClick={() => setTab('variables')}><Key className="mr-1 h-3 w-3" />Variables</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            <Card>
                <CardHeader><CardTitle className="text-sm">{tab === 'settings' ? 'Add setting' : 'Add variable'}</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="key" className="w-48" />
                    <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" className="flex-1" />
                    {tab === 'variables' && (
                        <label className="flex items-center gap-1 text-sm">
                            <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} className="h-4 w-4" />
                            Secret
                        </label>
                    )}
                    <Button onClick={tab === 'settings' ? addSetting : addVariable}><Plus className="mr-1 h-3 w-3" />Add</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-sm">{tab === 'settings' ? 'Settings' : 'Variables'} ({tab === 'settings' ? settings.length : variables.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                    {tab === 'settings' && settings.map((s) => (
                        <div key={s.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <span className="w-40 truncate font-mono text-xs">{s.key}</span>
                            <span className="flex-1 truncate">{s.value}</span>
                            <Button variant="ghost" size="sm" onClick={() => deleteSetting(s.key)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                    ))}
                    {tab === 'variables' && variables.map((v) => (
                        <div key={v.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <span className="w-40 truncate font-mono text-xs">{v.key}</span>
                            <span className="flex-1 truncate font-mono text-xs">{v.value}</span>
                            {v.is_secret && <Badge variant="secondary" className="text-[10px]">secret</Badge>}
                            <Button variant="ghost" size="sm" onClick={() => deleteVariable(v.key)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                    ))}
                    {tab === 'settings' && settings.length === 0 && <p className="text-sm text-muted-foreground">No settings.</p>}
                    {tab === 'variables' && variables.length === 0 && <p className="text-sm text-muted-foreground">No variables.</p>}
                </CardContent>
            </Card>
        </div>
    );
}
