import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { LogOut, FolderKanban, Plus, Check, Loader2, ChevronDown, Lock } from 'lucide-react';
import { isCloud } from '@/lib/edition';
import {
    useActiveProject, selectShowSelector, selectCanCreate,
} from '@/stores/useActiveProject';
import { toast } from 'sonner';

export const DashboardHeader: React.FC = () => {
    const { user, logout } = useAuth();
    const handleLogout = async () => { await logout(); };

    return (
        <header className="h-14 flex items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-4">
                <SidebarTrigger />
                {isCloud() ? <ProjectSelector /> : <h1 className="font-semibold text-foreground">Dashboard</h1>}
            </div>

            <div className="flex items-center gap-4">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                    {(user?.username || user?.email || 'AD').substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{user?.username || user?.email || 'Admin'}</p>
                                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};

/** Project selector + "New project" — shown when the tenant can have >1 project. */
const ProjectSelector: React.FC = () => {
    const queryClient = useQueryClient();
    const { projects, activeProjectId, loading, load, setActive, createProject } = useActiveProject();
    const showSelector = useActiveProject(selectShowSelector);
    const canCreate = useActiveProject(selectCanCreate);
    const [modalOpen, setModalOpen] = useState(false);
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => { if (isCloud()) load(); }, [load]);

    const active = projects.find((p) => p.id === activeProjectId);

    const switchTo = (id: string) => {
        setActive(id);
        // Project-scoped data must refetch against the new active project.
        queryClient.invalidateQueries();
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setCreating(true);
        try {
            await createProject(name.trim(), desc.trim() || undefined);
            queryClient.invalidateQueries();
            toast.success('Project created');
            setModalOpen(false); setName(''); setDesc('');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to create project');
        } finally {
            setCreating(false);
        }
    };

    // Single-project (Free) or still loading: render a plain title — no selector.
    if (!showSelector) {
        return <h1 className="font-semibold text-foreground">{active?.name || 'Dashboard'}</h1>;
    }

    return (
        <>
            {active?.status === 'locked' && (
                <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 font-medium">
                    “{active.name}” is locked — read-only (upgrade to re-activate)
                </span>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-9 gap-1.5 font-semibold">
                        {loading && !active ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4 text-primary" />}
                        <span className="max-w-[180px] truncate">{active?.name || 'Select project'}</span>
                        {active?.status === 'locked' && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
                    {projects.map((p) => (
                        <DropdownMenuItem key={p.id} onClick={() => switchTo(p.id)} className="justify-between">
                            <span className="flex items-center gap-2 truncate">
                                {p.name}
                                {p.is_default && <span className="text-[10px] text-muted-foreground">default</span>}
                                {p.status === 'locked' && <Lock className="h-3 w-3 text-amber-500" />}
                            </span>
                            {p.id === activeProjectId && <Check className="h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                    ))}
                    {canCreate && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setModalOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> New project
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {modalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-background border rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="p-5 border-b">
                            <h3 className="font-bold text-lg flex items-center gap-2"><FolderKanban className="w-5 h-5 text-primary" />New project</h3>
                        </div>
                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Name</label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My new app" required autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description (optional)</label>
                                <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this project for?" />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={creating || !name.trim()}>
                                    {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Create
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default DashboardHeader;
