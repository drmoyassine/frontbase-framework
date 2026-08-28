import { useState } from 'react';
import { Loader2, Plus, Server, Trash2, Edit, Plug, Wrench, Check, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentIntegrationsApi, McpServer, McpServerCreate, McpServerUpdate, McpTool } from '@/services/agentIntegrationsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const CATEGORY_COLORS: Record<string, string> = {
    database: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    web: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    utility: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    integration: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

interface McpServerFormProps {
    server?: McpServer;
    onSave: (data: McpServerCreate | McpServerUpdate) => void;
    onCancel: () => void;
    saving?: boolean;
}

function McpServerForm({ server, onSave, onCancel, saving }: McpServerFormProps) {
    const [name, setName] = useState(server?.name || '');
    const [slug, setSlug] = useState(server?.slug || '');
    const [description, setDescription] = useState(server?.description || '');
    const [url, setUrl] = useState(server?.url || '');
    const [transport, setTransport] = useState(server?.transport || 'streamable-http');
    const [authType, setAuthType] = useState(server?.authType || 'bearer');
    const [token, setToken] = useState('');
    const [category, setCategory] = useState(server?.category || '');
    const [isActive, setIsActive] = useState(server?.isActive ?? true);

    const handleSubmit = () => {
        if (!name.trim() || !slug.trim() || !url.trim()) {
            toast.error('Name, slug, and URL are required');
            return;
        }
        const data: McpServerCreate | McpServerUpdate = {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            url: url.trim(),
            transport,
            authType: authType || undefined,
            ...(token && { token }),
            category: category.trim() || undefined,
            isActive,
        };
        onSave(data);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="mcp-name">Name *</Label>
                    <Input
                        id="mcp-name"
                        placeholder="PostgreSQL MCP"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mcp-slug">Slug *</Label>
                    <Input
                        id="mcp-slug"
                        placeholder="postgres-mcp"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        disabled={saving}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="mcp-url">URL *</Label>
                <Input
                    id="mcp-url"
                    placeholder="https://mcp.example.com/sse"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={saving}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="mcp-transport">Transport</Label>
                    <select
                        id="mcp-transport"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                        value={transport}
                        onChange={(e) => setTransport(e.target.value)}
                        disabled={saving}
                    >
                        <option value="streamable-http">streamable-http</option>
                        <option value="sse">sse</option>
                        <option value="stdio">stdio</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mcp-auth">Auth Type</Label>
                    <select
                        id="mcp-auth"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                        value={authType || 'none'}
                        onChange={(e) => setAuthType(e.target.value || 'none')}
                        disabled={saving}
                    >
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="basic">Basic Auth</option>
                    </select>
                </div>
            </div>

            {authType && authType !== 'none' && (
                <div className="space-y-2">
                    <Label htmlFor="mcp-token">Token / Password</Label>
                    <Input
                        id="mcp-token"
                        type="password"
                        placeholder={authType === 'bearer' ? 'eyJhbGci...' : 'password'}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={saving}
                    />
                    <p className="text-[11px] text-slate-400">
                        {server?.hasAuth ? 'Leave blank to keep existing token' : 'Stored encrypted at rest'}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="mcp-category">Category</Label>
                    <Input
                        id="mcp-category"
                        placeholder="database"
                        value={category}
                        onChange={(e) => setCategory(e.target.value.toLowerCase())}
                        disabled={saving}
                    />
                </div>
                <div className="flex items-center gap-2 pt-6">
                    <input
                        id="mcp-active"
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        disabled={saving}
                        className="h-4 w-4 rounded border-slate-300"
                    />
                    <Label htmlFor="mcp-active" className="text-sm">Active</Label>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="mcp-description">Description</Label>
                <Textarea
                    id="mcp-description"
                    placeholder="MCP server for PostgreSQL database queries..."
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                    {server ? 'Update' : 'Create'} Server
                </Button>
            </div>
        </div>
    );
}

interface ToolsDialogProps {
    server: McpServer;
    open: boolean;
    onClose: () => void;
}

function ToolsDialog({ server, open, onClose }: ToolsDialogProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['mcp-server-tools', server.id],
        queryFn: () => agentIntegrationsApi.listMcpServerTools(server.id),
        enabled: open,
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-purple-500" />
                        Tools from {server.name}
                    </DialogTitle>
                    <DialogDescription>
                        {server.url} • {server.transport}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8 text-slate-500">
                        Failed to load tools: {(error as Error).message}
                    </div>
                ) : !data?.tools.length ? (
                    <div className="text-center py-8 text-slate-500">
                        No tools available from this server
                    </div>
                ) : (
                    <div className="space-y-2 py-4">
                        {data.tools.map((tool) => (
                            <div
                                key={tool.name}
                                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                            >
                                <div className="font-medium text-sm">{tool.name}</div>
                                {tool.description && (
                                    <div className="text-xs text-slate-500 mt-1">{tool.description}</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface Props {
    profileId?: string;
    profileSlug?: string;
}

export function McpServersManager({ profileId, profileSlug }: Props) {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingServer, setEditingServer] = useState<McpServer | null>(null);
    const [toolsServer, setToolsServer] = useState<McpServer | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['mcp-servers', profileSlug],
        queryFn: () => agentIntegrationsApi.listMcpServers(profileSlug),
    });

    const createMutation = useMutation({
        mutationFn: (data: McpServerCreate) => agentIntegrationsApi.createMcpServer({ ...data, profileSlug }),
        onSuccess: () => {
            toast.success('MCP server created');
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['mcp-servers', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create server'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: McpServerUpdate }) =>
            agentIntegrationsApi.updateMcpServer(id, data),
        onSuccess: () => {
            toast.success('MCP server updated');
            setEditingServer(null);
            queryClient.invalidateQueries({ queryKey: ['mcp-servers', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update server'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => agentIntegrationsApi.deleteMcpServer(id),
        onSuccess: () => {
            toast.success('MCP server deleted');
            queryClient.invalidateQueries({ queryKey: ['mcp-servers', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete server'),
    });

    const testMutation = useMutation({
        mutationFn: (id: string) => agentIntegrationsApi.testMcpServer(id),
        onSuccess: (result) => {
            if (result.reachable) {
                toast.success('MCP server is reachable');
            } else {
                toast.error('MCP server did not respond');
            }
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Connection test failed'),
    });

    const handleSave = (data: McpServerCreate | McpServerUpdate) => {
        if (editingServer) {
            updateMutation.mutate({ id: editingServer.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (server: McpServer) => {
        if (confirm(`Delete MCP server "${server.name}"?`)) {
            deleteMutation.mutate(server.id);
        }
    };

    const handleTest = (server: McpServer) => {
        testMutation.mutate(server.id);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
        );
    }

    const servers = data?.mcpServers || [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-md font-semibold text-slate-900 dark:text-white">MCP Servers</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        External MCP servers the agent can connect to as tool sources
                    </p>
                </div>
                <Button size="sm" onClick={() => setShowForm(true)} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-1" /> Add Server
                </Button>
            </div>

            {servers.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
                    <Server className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">No MCP servers configured</p>
                    <p className="text-xs text-slate-400 mt-1">Add a server to enable external tool sources</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {servers.map((server) => (
                        <div
                            key={server.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">{server.name}</span>
                                    {server.category && (
                                        <Badge className={CATEGORY_COLORS[server.category] || CATEGORY_COLORS.utility}>
                                            {server.category}
                                        </Badge>
                                    )}
                                    {!server.isActive && (
                                        <Badge variant="outline" className="text-slate-500">Inactive</Badge>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                    <code className="text-xs">{server.slug}</code>
                                    <span>•</span>
                                    <span className="truncate">{server.url}</span>
                                    <span>•</span>
                                    <span>{server.transport}</span>
                                    {server.hasAuth && (
                                        <>
                                            <span>•</span>
                                            <span className="text-green-600 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> Auth configured
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 ml-4">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleTest(server)}
                                    disabled={testMutation.isPending}
                                    title="Test connection"
                                >
                                    <Plug className="w-4 h-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setToolsServer(server)}
                                    title="View tools"
                                >
                                    <Wrench className="w-4 h-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingServer(server)}
                                    title="Edit"
                                >
                                    <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(server)}
                                    disabled={deleteMutation.isPending}
                                    title="Delete"
                                    className="text-red-600 hover:text-red-700"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={showForm || !!editingServer} onOpenChange={(open) => {
                if (!open) {
                    setShowForm(false);
                    setEditingServer(null);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Server className="w-5 h-5 text-purple-500" />
                            {editingServer ? 'Edit MCP Server' : 'Add MCP Server'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure an external MCP server as a tool source for the agent
                        </DialogDescription>
                    </DialogHeader>
                    <McpServerForm
                        server={editingServer || undefined}
                        onSave={handleSave}
                        onCancel={() => {
                            setShowForm(false);
                            setEditingServer(null);
                        }}
                        saving={createMutation.isPending || updateMutation.isPending}
                    />
                </DialogContent>
            </Dialog>

            {/* Tools Dialog */}
            {toolsServer && (
                <ToolsDialog
                    server={toolsServer}
                    open={!!toolsServer}
                    onClose={() => setToolsServer(null)}
                />
            )}
        </div>
    );
}
