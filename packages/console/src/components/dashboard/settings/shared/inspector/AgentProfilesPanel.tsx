import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, Save, Loader2, Database, Zap, LayoutDashboard, Wrench, MessageSquare, Shield, Puzzle, ChevronDown, ChevronRight, Globe, Check, X } from 'lucide-react';
import { McpServersManager } from '@/modules/admin/components/McpServersManager';
import { SkillsManager } from '@/modules/admin/components/SkillsManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { API_BASE } from './types';

interface AgentProfile {
    id?: string;
    engine_id?: string;
    name: string;
    slug: string;
    system_prompt: string;
    permissions: Record<string, string[]>;
    excluded_endpoints?: string[];
    // Feature-parity generation parameters (NULL = provider default)
    temperature?: number | null;
    max_tokens?: number | null;
    top_p?: number | null;
    created_at?: string;
}

interface ParsedEndpoint {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    tag: string;
}

export const AgentProfilesPanel: React.FC<{ engineId: string, engineName: string, openApiSpec?: any }> = ({ engineId, engineName, openApiSpec }) => {
    const queryClient = useQueryClient();
    const [selectedProfileId, setSelectedProfileId] = useState<string | 'new' | null>(null);

    const [editForm, setEditForm] = useState<Partial<AgentProfile>>({});

    const { data: profiles = [], isLoading } = useQuery<AgentProfile[]>({
        queryKey: ['edge-agent-profiles', engineId],
        queryFn: async () => {
            const url = `${API_BASE}/api/edge-engines/${engineId}/agent-profiles`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch agent profiles');
            const data = await res.json();
            return data.profiles || [];
        },
        enabled: !!engineId
    });

    const saveMutation = useMutation({
        mutationFn: async (profile: Partial<AgentProfile>) => {
            const isNew = selectedProfileId === 'new';
            const url = isNew 
                ? `${API_BASE}/api/edge-engines/${engineId}/agent-profiles`
                : `${API_BASE}/api/edge-engines/${engineId}/agent-profiles/${profile.id}`;
            
            const res = await fetch(url, {
                method: isNew ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profile)
            });
            if (!res.ok) throw new Error('Failed to save profile');
            return res.json();
        },
        onSuccess: (saved) => {
            queryClient.invalidateQueries({ queryKey: ['edge-agent-profiles', engineId] });
            setSelectedProfileId(saved.id);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const url = `${API_BASE}/api/edge-engines/${engineId}/agent-profiles/${id}`;
            const res = await fetch(url, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete profile');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edge-agent-profiles', engineId] });
            setSelectedProfileId(null);
        }
    });

    const handleSelect = (profile: AgentProfile) => {
        setSelectedProfileId(profile.id!);
        setEditForm({ ...profile });
    };

    const handleNew = () => {
        setSelectedProfileId('new');
        setEditForm({ name: '', slug: '', system_prompt: '', permissions: {}, excluded_endpoints: [], temperature: null, max_tokens: null, top_p: null });
    };

    const togglePermission = (resource: string, perm: string) => {
        const currentPerms = editForm.permissions || {};
        const resourcePerms = currentPerms[resource] || [];
        
        let newPerms;
        if (resourcePerms.includes(perm)) {
            newPerms = resourcePerms.filter(p => p !== perm);
        } else {
            newPerms = [...resourcePerms, perm];
        }

        setEditForm({ ...editForm, permissions: { ...currentPerms, [resource]: newPerms } });
    };

    const toggleEndpointExclusion = (operationId: string) => {
        const current = editForm.excluded_endpoints || [];
        const next = current.includes(operationId)
            ? current.filter(e => e !== operationId)
            : [...current, operationId];
        setEditForm({ ...editForm, excluded_endpoints: next });
    };

    const activeProfile = selectedProfileId === 'new' ? editForm : profiles.find(p => p.id === selectedProfileId);

    // Collapsible permission group state
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['data', 'automation', 'endpoints']));
    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    // Permission groups
    const dataAccessResources = [
        { id: 'datasources.all', label: 'All Datasources', icon: Database, available: ['read'] },
        { id: 'stateDb', label: 'State Database (Platform)', icon: LayoutDashboard, available: ['read'] },
    ];
    const automationResources = [
        { id: 'workflows.all', label: 'All Action Workflows', icon: Zap, available: ['trigger'] }
    ];

    // Parse OpenAPI spec into endpoint list grouped by tag
    const endpointsByTag = useMemo<Record<string, ParsedEndpoint[]>>(() => {
        if (!openApiSpec?.paths) return {};
        const groups: Record<string, ParsedEndpoint[]> = {};
        for (const [path, methods] of Object.entries(openApiSpec.paths || {})) {
            for (const [method, op] of Object.entries(methods as any)) {
                if (['get', 'post', 'put', 'patch', 'delete'].indexOf(method) === -1) continue;
                const operation = op as any;
                const operationId = operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                const tag = operation.tags?.[0] || 'Other';
                const summary = operation.summary || `${method.toUpperCase()} ${path}`;
                if (!groups[tag]) groups[tag] = [];
                groups[tag].push({ operationId, method, path, summary, tag });
            }
        }
        return groups;
    }, [openApiSpec]);

    return (
        <div className="flex-1 flex min-h-0 bg-background">
            {/* Left Sidebar (Profile List) */}
            <div className="w-[240px] border-r border-border bg-muted/20 flex flex-col min-h-0">
                <div className="p-3 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                        <Bot className="h-4 w-4" /> Agent Profiles
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNew}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {isLoading ? (
                            <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
                        ) : profiles.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleSelect(p)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                                    selectedProfileId === p.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent text-foreground'
                                }`}
                            >
                                <span className="truncate">{p.name}</span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">{p.slug}</Badge>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Content (Profile Editor) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {selectedProfileId ? (
                    <div className="p-6 space-y-6 w-full">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">{selectedProfileId === 'new' ? 'Create Agent Profile' : 'Edit Profile'}</h2>
                            <div className="flex items-center gap-2">
                                {selectedProfileId !== 'new' && (
                                    <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(selectedProfileId)}>
                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                    </Button>
                                )}
                                <Button size="sm" onClick={() => saveMutation.mutate(editForm)} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                    Save Profile
                                </Button>
                            </div>
                        </div>

                        <Tabs defaultValue="identity" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="identity" className="gap-1.5"><Bot className="h-3.5 w-3.5" />Identity & Persona</TabsTrigger>
                                <TabsTrigger value="tools" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />Tools & Skills</TabsTrigger>
                                <TabsTrigger value="channels" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Communication Channels</TabsTrigger>
                                <TabsTrigger value="permissions" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Permissions</TabsTrigger>
                            </TabsList>
                            
                            {/* ─── Tab 1: Identity & Persona ─── */}
                            <TabsContent value="identity" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Profile Name</label>
                                    <Input 
                                        value={editForm.name || ''} 
                                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g. Sales Assistant" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">URL Slug</label>
                                    <Input 
                                        value={editForm.slug || ''} 
                                        onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                                        placeholder="e.g. sales-bot" 
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground">System Prompt (The Agent's Persona & Rules)</label>
                                <Textarea
                                    value={editForm.system_prompt || ''}
                                    onChange={e => setEditForm(f => ({ ...f, system_prompt: e.target.value }))}
                                    placeholder="You are a helpful assistant..."
                                    className="min-h-[150px] font-mono text-[13px]"
                                />
                            </div>

                            {/* Generation parameters — feature parity with the Workspace Agent */}
                            <div className="space-y-4 rounded-md border border-border p-4 bg-muted/10">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-muted-foreground">Generation Parameters</label>
                                    <button
                                        type="button"
                                        className="text-[11px] text-muted-foreground hover:text-foreground"
                                        onClick={() => setEditForm(f => ({ ...f, temperature: null, max_tokens: null, top_p: null }))}
                                    >
                                        Use provider defaults
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-muted-foreground">Temperature</span>
                                        <span className="font-mono">{(editForm.temperature ?? 0.7).toFixed(2)}</span>
                                    </div>
                                    <Slider
                                        value={[editForm.temperature ?? 0.7]}
                                        min={0} max={2} step={0.05}
                                        onValueChange={(v) => setEditForm(f => ({ ...f, temperature: v[0] }))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[11px]">
                                        <span className="text-muted-foreground">Top P</span>
                                        <span className="font-mono">{(editForm.top_p ?? 0.9).toFixed(2)}</span>
                                    </div>
                                    <Slider
                                        value={[editForm.top_p ?? 0.9]}
                                        min={0} max={1} step={0.05}
                                        onValueChange={(v) => setEditForm(f => ({ ...f, top_p: v[0] }))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] text-muted-foreground">Max Tokens</label>
                                    <Input
                                        type="number" min={1} max={128000}
                                        value={editForm.max_tokens ?? 4096}
                                        onChange={e => setEditForm(f => ({ ...f, max_tokens: Math.max(1, Math.min(128000, Number(e.target.value) || 1)) }))}
                                    />
                                </div>
                            </div>
                            </TabsContent>

                            {/* ─── Tab 2: Tools & Skills (External) ─── */}
                            <TabsContent value="tools" className="space-y-6">
                                <div className="space-y-1.5">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Puzzle className="h-4 w-4" /> MCP Servers
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Connect external tool servers using the Model Context Protocol (MCP). The agent will be able to discover and invoke tools provided by these servers.
                                    </p>
                                    
                                    <div className="mt-4">
                                        <McpServersManager profileId={selectedProfileId === 'new' ? undefined : selectedProfileId} />
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-2 border-t border-border">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Zap className="h-4 w-4" /> Agent Skills
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Install pre-built skill packages that give your agent specialized abilities (e.g. web scraping, code execution, document parsing).
                                    </p>
                                    
                                    <div className="mt-4">
                                        <SkillsManager profileId={selectedProfileId === 'new' ? undefined : selectedProfileId} />
                                    </div>
                                </div>
                            </TabsContent>
                            
                            {/* ─── Tab 3: Communication Channels ─── */}
                            <TabsContent value="channels" className="space-y-6">
                                <div className="space-y-1.5">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Database className="h-4 w-4" /> API Endpoint (n8n, Make, Flowise)
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Use your Frontbase Edge Engine as a drop-in replacement for any OpenAI node to directly talk to this specifically configured agent.
                                    </p>
                                    
                                    <div className="mt-4 p-3 bg-muted/30 border border-border rounded-md space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">OpenAI-Compatible Base URL</label>
                                            <code className="block p-2 bg-background border border-border rounded text-xs select-all">
                                                https://{engineName}.frontbase.dev/api/agents/{editForm.slug || 'agent-slug'}/v1
                                            </code>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Authentication Header</label>
                                            <code className="block p-2 bg-background border border-border rounded text-xs">
                                                Bearer [YOUR_EDGE_API_KEY]
                                            </code>
                                        </div>
                                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary p-2 rounded border border-primary/20">
                                            <Zap className="inline-block w-3.5 h-3.5 mr-1" />
                                            <strong>Streaming Native:</strong> This endpoint fully supports Server-Sent Events (SSE). 
                                            You can directly enable "Stream Response" on your connection!
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-border">
                                    <h3 className="text-sm font-semibold">Consumer Messengers</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Bind this agent profile directly to external messaging platforms using webhooks.
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="border border-border rounded-md p-3 flex items-center justify-between bg-muted/10 opacity-60 cursor-not-allowed">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded bg-[#2AABEE]/10 flex items-center justify-center">
                                                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#2AABEE]" fill="currentColor">
                                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.686c.223-.195-.054-.304-.346-.108l-6.4 4.024-2.76-.86c-.6-.188-.61-.6.125-.892l10.774-4.15c.5-.188.94.116.787.827z" />
                                                    </svg>
                                                </div>
                                                <div className="font-medium text-sm">Telegram Bot</div>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                                        </div>

                                        <div className="border border-border rounded-md p-3 flex items-center justify-between bg-muted/10 opacity-60 cursor-not-allowed">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded bg-[#4A154B]/10 flex items-center justify-center">
                                                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#4A154B]" fill="currentColor">
                                                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.523-2.522v-2.522h2.523zM15.165 17.688a2.527 2.527 0 0 1-2.523-2.523 2.526 2.526 0 0 1 2.523-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                                                    </svg>
                                                </div>
                                                <div className="font-medium text-sm">Slack App</div>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ─── Tab 4: Permissions (Internal Engine Tools) ─── */}
                            <TabsContent value="permissions" className="space-y-5">
                                <p className="text-xs text-muted-foreground">Controls what internal engine resources this agent is allowed to access and which API endpoints it can invoke as tools.</p>

                                {/* ── Group: Data Access ── */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <button onClick={() => toggleGroup('data')} className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                                        <span className="text-sm font-semibold flex items-center gap-2">
                                            <Database className="h-4 w-4 text-muted-foreground" /> Data Access
                                        </span>
                                        {expandedGroups.has('data') ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </button>
                                    {expandedGroups.has('data') && (
                                        <div className="divide-y divide-border">
                                            {dataAccessResources.map(rt => {
                                                const currentPerms = editForm.permissions?.[rt.id] || [];
                                                const Icon = rt.icon;
                                                return (
                                                    <div key={rt.id} className="flex justify-between items-center p-3 bg-background">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-muted/30 border border-border p-1.5 rounded-md">
                                                                <Icon className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium">{rt.label}</div>
                                                                <div className="text-[10px] text-muted-foreground font-mono">{rt.id}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {rt.available.map(perm => {
                                                                const isEnabled = currentPerms.includes(perm) || currentPerms.includes('all');
                                                                return (
                                                                    <Button key={perm} size="sm" variant={isEnabled ? 'default' : 'outline'} onClick={() => togglePermission(rt.id, perm)} className={`h-7 px-3 text-xs capitalize ${isEnabled ? 'bg-primary text-white' : ''}`}>
                                                                        {perm}
                                                                    </Button>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* ── Group: Automation ── */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <button onClick={() => toggleGroup('automation')} className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                                        <span className="text-sm font-semibold flex items-center gap-2">
                                            <Zap className="h-4 w-4 text-muted-foreground" /> Automation
                                        </span>
                                        {expandedGroups.has('automation') ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </button>
                                    {expandedGroups.has('automation') && (
                                        <div className="divide-y divide-border">
                                            {automationResources.map(rt => {
                                                const currentPerms = editForm.permissions?.[rt.id] || [];
                                                const Icon = rt.icon;
                                                return (
                                                    <div key={rt.id} className="flex justify-between items-center p-3 bg-background">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-muted/30 border border-border p-1.5 rounded-md">
                                                                <Icon className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium">{rt.label}</div>
                                                                <div className="text-[10px] text-muted-foreground font-mono">{rt.id}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {rt.available.map(perm => {
                                                                const isEnabled = currentPerms.includes(perm) || currentPerms.includes('all');
                                                                return (
                                                                    <Button key={perm} size="sm" variant={isEnabled ? 'default' : 'outline'} onClick={() => togglePermission(rt.id, perm)} className={`h-7 px-3 text-xs capitalize ${isEnabled ? 'bg-primary text-white' : ''}`}>
                                                                        {perm}
                                                                    </Button>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* ── Group: Internal API Endpoints ── */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <button onClick={() => toggleGroup('endpoints')} className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <Globe className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-semibold">Internal API Endpoints</span>
                                            {Object.keys(endpointsByTag).length > 0 && (
                                                <Badge variant="secondary" className="text-[10px] ml-1">
                                                    {Object.values(endpointsByTag).flat().length} endpoints
                                                </Badge>
                                            )}
                                        </div>
                                        {expandedGroups.has('endpoints') ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </button>
                                    {expandedGroups.has('endpoints') && (
                                        <div className="bg-background">
                                            <div className="px-3 py-2 border-b border-border bg-muted/10">
                                                <p className="text-[11px] text-muted-foreground">All endpoints are <strong>included</strong> by default. Click to exclude specific endpoints from this agent's tool access.</p>
                                            </div>
                                            {Object.keys(endpointsByTag).length === 0 ? (
                                                <div className="p-6 text-center text-sm text-muted-foreground">
                                                    <Globe className="h-6 w-6 mx-auto mb-2 opacity-30" />
                                                    No OpenAPI endpoints detected. Deploy the engine to load its API spec.
                                                </div>
                                            ) : (
                                                Object.entries(endpointsByTag).map(([tag, endpoints]) => (
                                                    <div key={tag}>
                                                        <div className="px-3 py-1.5 bg-muted/20 border-b border-border">
                                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{tag}</span>
                                                        </div>
                                                        <div className="divide-y divide-border/50">
                                                            {endpoints.map(ep => {
                                                                const isExcluded = (editForm.excluded_endpoints || []).includes(ep.operationId);
                                                                const methodColors: Record<string, string> = {
                                                                    get: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                                                                    post: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                                                                    put: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                                                                    patch: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
                                                                    delete: 'bg-red-500/10 text-red-600 border-red-500/20',
                                                                };
                                                                return (
                                                                    <div
                                                                        key={ep.operationId}
                                                                        className={`flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer ${isExcluded ? 'opacity-50' : ''}`}
                                                                        onClick={() => toggleEndpointExclusion(ep.operationId)}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <Badge variant="outline" className={`text-[9px] font-mono uppercase w-14 justify-center shrink-0 ${methodColors[ep.method] || ''}`}>
                                                                                {ep.method}
                                                                            </Badge>
                                                                            <div className="min-w-0">
                                                                                <div className="text-xs font-medium truncate">{ep.summary}</div>
                                                                                <div className="text-[10px] text-muted-foreground font-mono truncate">{ep.path}</div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="shrink-0 ml-3">
                                                                            {isExcluded ? (
                                                                                <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30">
                                                                                    <X className="h-3 w-3" /> Excluded
                                                                                </Badge>
                                                                            ) : (
                                                                                <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-500/30">
                                                                                    <Check className="h-3 w-3" /> Included
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <Bot className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Select an agent profile or create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
