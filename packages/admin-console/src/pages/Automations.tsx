/**
 * Automations — visual workflow editor (React Flow) + execution history.
 * Phase 3c / F2. Nodes positioned on a canvas, draggable + connectable.
 * Nodes/edges persisted as JSON; the graph is the React Flow shape.
 */
import { useEffect, useState } from 'react';
import type { Edge } from 'reactflow';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkflowEditor, defaultPosition, nodeStyle, type RfNode, type WorkflowGraph } from '@/components/WorkflowEditor';
import { Plus, Play, Power } from 'lucide-react';

interface Workflow {
    id: string;
    name: string;
    nodes: string;
    edges: string;
    is_active: number | boolean;
    version: number;
    updated_at: string;
}

interface Execution {
    id: string;
    workflow_id: string;
    status: string;
    trigger: string;
    result: string | null;
    error: string | null;
    started_at: string;
    ended_at: string | null;
}

const NODE_TYPES = ['trigger', 'condition', 'action', 'delay', 'webhook', 'email', 'transform'];
const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

/** Parse stored nodes/edges JSON into a React Flow graph. Tolerates the legacy
 *  `{id,type,label}` shape (assigns default positions) and the native RF shape. */
function parseGraph(nodesJson: string, edgesJson: string): WorkflowGraph {
    const rawNodes = JSON.parse(nodesJson || '[]') as Array<Record<string, unknown>>;
    const nodes: RfNode[] = rawNodes.map((n, i) => ({
        id: String(n.id ?? `n${i}`),
        type: n.type === 'input' || n.type === 'output' || n.type === 'default' ? undefined : (n.type as string),
        position: (n.position as { x: number; y: number }) ?? defaultPosition(i),
        data: { label: String((n.data as { label?: string })?.label ?? n.label ?? `${n.type ?? 'node'} ${i + 1}`), type: String((n.data as { type?: string })?.type ?? n.type ?? 'action') },
        style: nodeStyle(String((n.data as { type?: string })?.type ?? n.type ?? 'action')),
    }));
    const edges = JSON.parse(edgesJson || '[]') as Edge[];
    return { nodes, edges };
}

export function Automations() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [graph, setGraph] = useState<WorkflowGraph>(EMPTY_GRAPH);
    const [executions, setExecutions] = useState<Execution[]>([]);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const load = () => api<{ workflows: Workflow[] }>('/automations')
        .then((r) => setWorkflows(r.workflows ?? []))
        .catch(() => setWorkflows([]));

    useEffect(() => { load(); }, []);

    const open = async (id: string) => {
        setSelected(id); setMsg(null);
        try {
            const { workflow } = await api<{ workflow: Workflow }>(`/automations/${id}`);
            setName(workflow.name);
            setGraph(parseGraph(workflow.nodes, workflow.edges));
            const { executions: execs } = await api<{ executions: Execution[] }>(`/automations/${id}/executions`);
            setExecutions(execs ?? []);
        } catch {
            setMsg({ kind: 'err', text: 'failed to load' });
        }
    };

    const newWorkflow = () => {
        const id = `wf-${Date.now().toString(36)}`;
        setSelected(id);
        setName('New automation');
        setGraph({ nodes: [{ id: 'n1', type: undefined, position: defaultPosition(0), data: { label: 'When page published', type: 'trigger' }, style: nodeStyle('trigger') }], edges: [] });
        setExecutions([]);
        setMsg(null);
    };

    const addNode = (type: string) => {
        const id = `n${graph.nodes.length + 1}-${Date.now().toString(36)}`;
        setGraph({
            ...graph,
            nodes: [...graph.nodes, { id, type: undefined, position: defaultPosition(graph.nodes.length), data: { label: `${type} step`, type }, style: nodeStyle(type) }],
        });
    };

    const save = async () => {
        if (!selected) return;
        setBusy(true); setMsg(null);
        try {
            await api(`/automations/${selected}`, {
                method: 'PUT',
                body: JSON.stringify({ name, nodes: JSON.stringify(graph.nodes), edges: JSON.stringify(graph.edges) }),
            });
            setMsg({ kind: 'ok', text: 'Saved' });
            await load();
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        } finally { setBusy(false); }
    };

    const execute = async () => {
        if (!selected) return;
        setBusy(true); setMsg(null);
        try {
            await api(`/automations/${selected}/execute`, { method: 'POST', body: JSON.stringify({ trigger: 'manual' }) });
            setMsg({ kind: 'ok', text: 'Executed' });
            await open(selected);
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        } finally { setBusy(false); }
    };

    const toggle = async (wf: Workflow) => {
        const isActive = !wf.is_active;
        await api(`/automations/${wf.id}/toggle`, { method: 'POST', body: JSON.stringify({ isActive }) });
        await load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Automations</h1>
                    <p className="text-muted-foreground">Build workflows visually — drag nodes, connect them, run.</p>
                </div>
                <Button onClick={newWorkflow}><Plus className="mr-2 h-4 w-4" />New</Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
                <Card>
                    <CardHeader><CardTitle className="text-sm">Workflows</CardTitle></CardHeader>
                    <CardContent className="space-y-1 p-3">
                        {workflows.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">None yet.</p>}
                        {workflows.map((wf) => (
                            <div key={wf.id} className="flex items-center gap-2">
                                <button onClick={() => open(wf.id)}
                                    className={`flex-1 truncate rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${selected === wf.id ? 'bg-accent font-medium' : ''}`}>
                                    {wf.name}
                                </button>
                                <button onClick={() => toggle(wf)} className="p-1" title={wf.is_active ? 'Deactivate' : 'Activate'}>
                                    <Power className={`h-4 w-4 ${wf.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                                </button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="text-sm">{selected ? 'Editor' : 'Select a workflow'}</CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" disabled={!selected || busy} onClick={save}>Save</Button>
                            <Button size="sm" disabled={!selected || busy} onClick={execute}><Play className="mr-1 h-3 w-3" />Run</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}
                        {selected && (
                            <>
                                <div>
                                    <Label className="text-xs">Name</Label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {NODE_TYPES.map((t) => (
                                        <Button key={t} variant="outline" size="sm" onClick={() => addNode(t)}><Plus className="mr-1 h-3 w-3" />{t}</Button>
                                    ))}
                                </div>
                                <div>
                                    <Label className="text-xs">Canvas (drag to position, drag between handles to connect)</Label>
                                    <div className="mt-2">
                                        <WorkflowEditor graph={graph} onChange={setGraph} />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs">Recent executions</Label>
                                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                                        {executions.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
                                        {executions.map((ex) => (
                                            <div key={ex.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                                                <span>{ex.trigger}</span>
                                                <Badge variant={ex.status === 'completed' ? 'default' : 'destructive'} className="text-[10px]">{ex.status}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
