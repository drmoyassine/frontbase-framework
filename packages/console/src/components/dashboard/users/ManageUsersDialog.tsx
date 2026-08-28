import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import { usersApi, type AppUser } from '@/services/usersApi';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Manage app users (GoTrue): list, search, disable/enable, delete.
 * The browsing DataTable in UserManagementTable is left untouched (it has no
 * row-action API); this dialog provides the auth actions on top of /api/users.
 */
export const ManageUsersDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const load = useCallback(async (q?: string) => {
        setLoading(true);
        setError(null);
        try {
            const { users: rows } = await usersApi.list({ search: q || undefined, per_page: 100 });
            setUsers(rows);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to load users');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const act = async (user: AppUser, fn: () => Promise<unknown>, reload = true) => {
        setPendingId(user.id);
        try {
            await fn();
            if (reload) await load(search);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Action failed');
        } finally {
            setPendingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Manage app users</DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') load(search); }}
                            className="pl-8"
                        />
                    </div>
                    <Button variant="outline" onClick={() => load(search)} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                    </Button>
                </div>

                {error && (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto -mx-1 px-1">
                    {loading && users.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                        </div>
                    ) : users.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">No app users found.</div>
                    ) : (
                        <ul className="divide-y">
                            {users.map((u) => (
                                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{u.email || '(no email)'}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {u.disabled ? 'Disabled' : 'Active'}
                                            {u.last_sign_in_at ? ` · last sign-in ${new Date(u.last_sign_in_at).toLocaleDateString()}` : ' · never signed in'}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={pendingId === u.id}
                                            onClick={() => act(u, () => usersApi.setState(u.id, !u.disabled))}
                                            title={u.disabled ? 'Enable' : 'Disable'}
                                        >
                                            {u.disabled ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={pendingId === u.id}
                                            onClick={() => {
                                                if (window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) {
                                                    void act(u, () => usersApi.remove(u.id));
                                                }
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
