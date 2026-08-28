/**
 * TenantTeamPanel — tenant self-service team management (cloud).
 *
 * Invite teammates (gated by the plan's team_members seat limit), assign which
 * projects they can access, and manage per-project member access. Seat usage is
 * read from /me/plan; projects from the active-project store.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, X, UserPlus, Check, Database } from 'lucide-react';
import { tenantTeamApi } from '@/services/tenantTeamApi';
import { STALE } from '@/lib/queryCache';
import { tenantPlanApi } from '@/services/tenantPlanApi';
import { projectsApi } from '@/services/projectsApi';
import { useActiveProject } from '@/stores/useActiveProject';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';

const UNLIMITED = -1;

export const TenantTeamPanel: React.FC = () => {
    const queryClient = useQueryClient();
    const { projects, activeProjectId } = useActiveProject();
    const role = (useAuthStore.getState() as any)?.user?.role;
    const canManage = role === 'owner' || role === 'admin';

    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
    const [grantedProjectIds, setGrantedProjectIds] = useState<string[] | null>(null);

    const { data: invitesData, isLoading } = useQuery({
        queryKey: ['tenant-invites'],
        queryFn: () => tenantTeamApi.listInvites(),
        staleTime: STALE.DEFAULT,
    });
    const { data: planData } = useQuery({
        queryKey: ['my-plan'],
        queryFn: () => tenantPlanApi.getMyPlan(),
        staleTime: STALE.DEFAULT,
    });

    const invites = invitesData?.invites ?? [];
    const seatLimit = typeof planData?.limits?.team_members === 'number' ? planData.limits.team_members as number : undefined;
    const membersUsed = planData?.usage?.team_members ?? 0;
    const seatsUsed = membersUsed + invites.length;
    const isFull = seatLimit !== undefined && seatLimit !== UNLIMITED && seatsUsed >= seatLimit;

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['tenant-invites'] });
        queryClient.invalidateQueries({ queryKey: ['my-plan'] });
        queryClient.invalidateQueries({ queryKey: ['project-members'] });
    };

    const inviteMutation = useMutation({
        mutationFn: () => tenantTeamApi.createInvite(
            email.trim().toLowerCase(),
            inviteRole,
            // admins/owners get all projects implicitly; editors/viewers get the selected set
            inviteRole === 'admin' ? undefined : grantedProjectIds,
        ),
        onSuccess: () => {
            toast.success('Invitation sent'); setEmail(''); setGrantedProjectIds(null); refresh();
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to send invite'),
    });
    const revokeMutation = useMutation({
        mutationFn: (id: string) => tenantTeamApi.revokeInvite(id),
        onSuccess: () => { toast.success('Invite revoked'); refresh(); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to revoke'),
    });

    const toggleProject = (id: string) => {
        const cur = grantedProjectIds ?? [];
        setGrantedProjectIds(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Team Members</CardTitle>
                    <CardDescription>
                        Invite teammates to your workspace.
                        {seatLimit !== undefined && (
                            <span className="ml-1">
                                {seatLimit === UNLIMITED
                                    ? 'Unlimited seats on your plan.'
                                    : `${seatsUsed} of ${seatLimit} seats used (members + pending invites).`}
                            </span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {canManage ? (
                        <>
                            <form
                                onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviteMutation.mutate(); }}
                                className="flex flex-col gap-3"
                            >
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Input
                                        type="email" placeholder="teammate@company.com" value={email}
                                        onChange={(e) => setEmail(e.target.value)} required className="flex-1"
                                        disabled={isFull}
                                    />
                                    <select
                                        value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} disabled={isFull}
                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                        <option value="admin">Admin (all projects)</option>
                                        <option value="editor">Editor</option>
                                        <option value="viewer">Viewer</option>
                                    </select>
                                    <Button type="submit" disabled={isFull || inviteMutation.isPending || !email.trim()}>
                                        {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send invite'}
                                    </Button>
                                </div>
                                {inviteRole !== 'admin' && projects.length > 1 && (
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                            Grant access to
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {projects.map((p) => {
                                                const selected = (grantedProjectIds ?? projects.map((x) => x.id)).includes(p.id);
                                                return (
                                                    <button
                                                        type="button" key={p.id}
                                                        onClick={() => toggleProject(p.id)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                                            selected
                                                                ? 'bg-primary text-primary-foreground border-primary'
                                                                : 'bg-background border-border text-muted-foreground hover:bg-accent'
                                                        }`}
                                                    >
                                                        {selected && <Check className="inline w-3 h-3 mr-1" />}{p.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Leave all selected to grant every current project.
                                        </p>
                                    </div>
                                )}
                            </form>
                            {isFull && (
                                <p className="text-sm text-amber-600">
                                    You've used all your seats. Upgrade your plan or revoke a pending invite to add more.
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">Only owners/admins can invite teammates.</p>
                    )}

                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pending invites</p>
                        {isLoading ? (
                            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                        ) : invites.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No pending invites.</p>
                        ) : (
                            <ul className="divide-y divide-border rounded-lg border border-border">
                                {invites.map((inv) => (
                                    <li key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <span className="truncate text-sm">{inv.email}</span>
                                            <span className="text-xs text-muted-foreground uppercase">{inv.role}</span>
                                        </div>
                                        {canManage && (
                                            <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(inv.id)}
                                                disabled={revokeMutation.isPending}>
                                                <X className="w-4 h-4 mr-1" />Revoke
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>

            {activeProjectId && <ProjectMembersCard projectId={activeProjectId} canManage={canManage} />}
            {activeProjectId && <SharedDataSourcesCard projectId={activeProjectId} canManage={canManage} />}
        </div>
    );
};

/** Members of the active project — view, and (for owners/admins) add/remove editors/viewers. */
const ProjectMembersCard: React.FC<{ projectId: string; canManage: boolean }> = ({ projectId, canManage }) => {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['project-members', projectId],
        queryFn: () => projectsApi.listMembers(projectId),
        staleTime: STALE.DEFAULT,
    });
    const [addUserId, setAddUserId] = useState('');
    const [addRole, setAddRole] = useState<'editor' | 'viewer'>('viewer');

    const addMutation = useMutation({
        mutationFn: () => projectsApi.addMember(projectId, addUserId.trim(), addRole),
        onSuccess: () => { toast.success('Access granted'); setAddUserId(''); queryClient.invalidateQueries({ queryKey: ['project-members', projectId] }); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to grant access'),
    });
    const removeMutation = useMutation({
        mutationFn: (uid: string) => projectsApi.removeMember(projectId, uid),
        onSuccess: () => { toast.success('Access removed'); queryClient.invalidateQueries({ queryKey: ['project-members', projectId] }); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to remove access'),
    });

    const members = data?.members ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Project Access</CardTitle>
                <CardDescription>Who can access this project. Owners/admins have access to all projects.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members.</p>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {members.map((m) => (
                            <li key={m.user_id} className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate text-sm">{m.email || m.user_id}</span>
                                    <span className="text-xs text-muted-foreground uppercase">{m.role}</span>
                                    {m.implicit && <span className="text-[10px] text-muted-foreground">(admin)</span>}
                                </div>
                                {canManage && !m.implicit && (
                                    <Button variant="ghost" size="sm" onClick={() => removeMutation.mutate(m.user_id)}
                                        disabled={removeMutation.isPending}>
                                        <X className="w-4 h-4 mr-1" />Remove
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {canManage && (
                    <form onSubmit={(e) => { e.preventDefault(); if (addUserId.trim()) addMutation.mutate(); }} className="flex gap-2">
                        <Input placeholder="User ID" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1" />
                        <select value={addRole} onChange={(e) => setAddRole(e.target.value as any)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                        </select>
                        <Button type="submit" disabled={addMutation.isPending || !addUserId.trim()}>
                            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Grant'}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
};

/** Shared data sources for the active project — grant/revoke cross-project sharing. */
const SharedDataSourcesCard: React.FC<{ projectId: string; canManage: boolean }> = ({ projectId, canManage }) => {
    const queryClient = useQueryClient();
    const [pick, setPick] = useState('');
    const { data, isLoading } = useQuery({
        queryKey: ['project-datasources', projectId],
        queryFn: () => projectsApi.listProjectDatasources(projectId),
        staleTime: STALE.DEFAULT,
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['project-datasources', projectId] });
    const grantMutation = useMutation({
        mutationFn: () => projectsApi.grantDatasource(projectId, pick),
        onSuccess: () => { toast.success('Data source shared'); setPick(''); refresh(); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to share'),
    });
    const revokeMutation = useMutation({
        mutationFn: (id: string) => projectsApi.revokeDatasource(projectId, id),
        onSuccess: () => { toast.success('Removed'); refresh(); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to remove'),
    });

    const granted = data?.granted ?? [];
    const available = data?.available ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Shared Data Sources</CardTitle>
                <CardDescription>Data sources this project can use. Share across projects without duplicating connections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : granted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No shared data sources yet.</p>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {granted.map((d) => (
                            <li key={d.id} className="flex items-center justify-between px-4 py-2.5">
                                <span className="truncate text-sm">{d.name}</span>
                                {canManage && (
                                    <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(d.id)} disabled={revokeMutation.isPending}>
                                        <X className="w-4 h-4 mr-1" />Remove
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {canManage && available.length > 0 && (
                    <div className="flex gap-2">
                        <select value={pick} onChange={(e) => setPick(e.target.value)}
                            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Share a data source…</option>
                            {available.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <Button onClick={() => pick && grantMutation.mutate()} disabled={!pick || grantMutation.isPending}>
                            {grantMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Share'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default TenantTeamPanel;
