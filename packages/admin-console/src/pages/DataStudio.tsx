/**
 * Data Studio — datasource management + table browser + query editor.
 * Phase 3b / F7. CRUD over /api/console/datasources; introspection via
 * /datasources/:id/tables, /tables/:t/columns, /tables/:t/rows, /query.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Database, Table2, Play } from 'lucide-react';

interface Datasource { id: string; name: string; kind: string; }

export function DataStudio() {
    const [datasources, setDatasources] = useState<Datasource[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [columns, setColumns] = useState<{ name: string; type: string; pk: boolean }[]>([]);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [query, setQuery] = useState('SELECT * FROM published_pages LIMIT 10');
    const [queryResult, setQueryResult] = useState<Record<string, unknown>[] | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ id: '', name: '', kind: 'sqlite', url: '', authToken: '', accountId: '', databaseId: '', apiToken: '', serviceKey: '' });
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const loadSources = () => api<{ datasources: Datasource[] }>('/datasources').then((r) => setDatasources(r.datasources ?? [])).catch(() => setDatasources([]));
    useEffect(() => { loadSources(); }, []);

    const openSource = async (id: string) => {
        setSelected(id); setSelectedTable(null); setRows([]); setColumns([]); setQueryResult(null); setMsg(null);
        try {
            const { tables: t } = await api<{ tables: string[] }>(`/datasources/${id}/tables`);
            setTables(t ?? []);
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'connect failed' }); }
    };

    const openTable = async (table: string) => {
        if (!selected) return;
        setSelectedTable(table);
        try {
            const [cols, rowsRes] = await Promise.all([
                api<{ columns: { name: string; type: string; pk: boolean }[] }>(`/datasources/${selected}/tables/${table}/columns`),
                api<{ rows: Record<string, unknown>[] }>(`/datasources/${selected}/tables/${table}/rows?limit=50`),
            ]);
            setColumns(cols.columns ?? []);
            setRows(rowsRes.rows ?? []);
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' }); }
    };

    const runQuery = async () => {
        if (!selected) return;
        setMsg(null);
        try {
            const { rows } = await api<{ rows: Record<string, unknown>[] }>(`/datasources/${selected}/query`, { method: 'POST', body: JSON.stringify({ sql: query }) });
            setQueryResult(rows);
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'query failed' }); }
    };

    const createSource = async () => {
        if (!form.id || !form.name) { setMsg({ kind: 'err', text: 'ID + name required' }); return; }
        const config: Record<string, string> = {};
        if (form.kind === 'sqlite' || form.kind === 'turso') { config.url = form.url; if (form.authToken) config.authToken = form.authToken; }
        else if (form.kind === 'd1') { config.accountId = form.accountId; config.databaseId = form.databaseId; config.apiToken = form.apiToken; }
        else if (form.kind === 'supabase') { config.url = form.url; config.serviceKey = form.serviceKey; }
        setMsg(null);
        try {
            await api(`/datasources/${form.id}`, { method: 'PUT', body: JSON.stringify({ name: form.name, kind: form.kind, config }) });
            setShowForm(false);
            setForm({ id: '', name: '', kind: 'sqlite', url: '', authToken: '', accountId: '', databaseId: '', apiToken: '', serviceKey: '' });
            await loadSources();
        } catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' }); }
    };

    const removeSource = async (id: string) => { await api(`/datasources/${id}`, { method: 'DELETE' }); if (selected === id) setSelected(null); await loadSources(); };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Data Studio</h1>
                    <p className="text-muted-foreground">Connect databases, browse tables, run queries.</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}><Plus className="mr-2 h-4 w-4" />Connect</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            {showForm && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">New datasource</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <div><Label className="text-xs">ID</Label><Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></div>
                        <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div className="md:col-span-2">
                            <Label className="text-xs">Kind</Label>
                            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                <option value="sqlite">SQLite</option>
                                <option value="turso">Turso (libsql)</option>
                                <option value="d1">Cloudflare D1</option>
                                <option value="supabase">Supabase</option>
                                <option value="postgres">Postgres (soon)</option>
                            </select>
                        </div>
                        {(form.kind === 'sqlite' || form.kind === 'turso') && (
                            <>
                                <div className="md:col-span-2"><Label className="text-xs">URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="file:... or libsql://..." /></div>
                                <div className="md:col-span-2"><Label className="text-xs">Auth token (Turso)</Label><Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} /></div>
                            </>
                        )}
                        {form.kind === 'd1' && (
                            <>
                                <div><Label className="text-xs">Account ID</Label><Input value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} /></div>
                                <div><Label className="text-xs">Database ID</Label><Input value={form.databaseId} onChange={(e) => setForm({ ...form, databaseId: e.target.value })} /></div>
                                <div className="md:col-span-2"><Label className="text-xs">API token</Label><Input value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} /></div>
                            </>
                        )}
                        {form.kind === 'supabase' && (
                            <>
                                <div className="md:col-span-2"><Label className="text-xs">URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://x.supabase.co" /></div>
                                <div className="md:col-span-2"><Label className="text-xs">Service key</Label><Input value={form.serviceKey} onChange={(e) => setForm({ ...form, serviceKey: e.target.value })} /></div>
                            </>
                        )}
                        <div className="md:col-span-2"><Button onClick={createSource}>Connect</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-[220px_200px_1fr]">
                {/* Datasources */}
                <Card className="overflow-y-auto">
                    <CardHeader><CardTitle className="text-sm">Datasources</CardTitle></CardHeader>
                    <CardContent className="space-y-1 p-3">
                        {datasources.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">None.</p>}
                        {datasources.map((d) => (
                            <div key={d.id} className="flex items-center gap-1">
                                <button onClick={() => openSource(d.id)} className={`flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${selected === d.id ? 'bg-accent font-medium' : ''}`}>
                                    <Database className="h-3 w-3" /><span className="truncate">{d.name}</span>
                                </button>
                                <Button variant="ghost" size="sm" onClick={() => removeSource(d.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Tables */}
                <Card className="overflow-y-auto">
                    <CardHeader><CardTitle className="text-sm">Tables {selected && <Badge variant="outline" className="ml-1 text-[10px]">{tables.length}</Badge>}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 p-3">
                        {!selected && <p className="px-2 py-4 text-sm text-muted-foreground">Select a datasource.</p>}
                        {tables.map((t) => (
                            <button key={t} onClick={() => openTable(t)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${selectedTable === t ? 'bg-accent font-medium' : ''}`}>
                                <Table2 className="h-3 w-3" /><span className="truncate">{t}</span>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Browser + query */}
                <Card className="overflow-hidden">
                    <CardHeader><CardTitle className="text-sm">{selectedTable ? `Table: ${selectedTable}` : 'Browse'}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {selectedTable && (
                            <div className="overflow-x-auto">
                                <div className="mb-2 flex flex-wrap gap-1">
                                    {columns.map((c) => (
                                        <Badge key={c.name} variant={c.pk ? 'default' : 'outline'} className="text-[10px]">{c.name}<span className="ml-1 opacity-50">{c.type}</span></Badge>
                                    ))}
                                </div>
                                <div className="max-h-48 overflow-auto rounded-md border">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted sticky top-0"><tr>{columns.map((c) => <th key={c.name} className="p-2 text-left font-medium">{c.name}</th>)}</tr></thead>
                                        <tbody>
                                            {rows.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={columns.length}>No rows.</td></tr>}
                                            {rows.map((row, i) => (
                                                <tr key={i} className="border-t">{columns.map((c) => <td key={c.name} className="p-2">{String(row[c.name] ?? '')}</td>)}</tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        {selected && (
                            <div>
                                <Label className="text-xs">Query (read-only SELECT)</Label>
                                <textarea value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} className="mt-1 h-20 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" />
                                <Button size="sm" className="mt-2" onClick={runQuery}><Play className="mr-1 h-3 w-3" />Run</Button>
                                {queryResult && (
                                    <div className="mt-2 max-h-40 overflow-auto rounded-md border">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted sticky top-0">{queryResult[0] && <tr>{Object.keys(queryResult[0]).map((k) => <th key={k} className="p-2 text-left">{k}</th>)}</tr>}</thead>
                                            <tbody>{queryResult.map((row, i) => <tr key={i} className="border-t">{Object.values(row).map((v, j) => <td key={j} className="p-2">{String(v ?? '')}</td>)}</tr>)}</tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
