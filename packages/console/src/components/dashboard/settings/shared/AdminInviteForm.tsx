import React, { useState } from 'react';
import { Mail, CheckCircle2, UserPlus, ShieldAlert, Loader2 } from 'lucide-react';
import { settingsApi } from '@/modules/dbsync/api';

export function AdminInviteForm() {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'admin' | 'member'>('admin');
    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setIsSending(true);
        setResult(null);

        try {
            const res = await settingsApi.sendAdminInvite({ email, role });
            setResult(res.data);
            if (res.data.success) {
                setEmail(''); // clear form on success
            }
        } catch (error: any) {
            setResult({
                success: false,
                message: error.response?.data?.detail || error.message || "Failed to send invitation"
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-foreground">Invite Administrators</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Invite team members to access the dashboard and manage settings.
                    </p>
                </div>
            </div>

            <form onSubmit={handleInvite} className="pt-4 border-t border-border space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6 space-y-2">
                        <label className="text-sm font-medium text-foreground">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="colleague@yourcompany.com"
                        />
                    </div>

                    <div className="md:col-span-4 space-y-2">
                        <label className="text-sm font-medium text-foreground">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as any)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="admin">Administrator</option>
                            <option value="member" disabled>Member (Coming Soon)</option>
                        </select>
                    </div>

                    <div className="md:col-span-2 space-y-2 flex items-end">
                        <button
                            type="submit"
                            disabled={isSending || !email}
                            className="flex items-center justify-center h-10 w-full bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <UserPlus className="w-4 h-4 mr-2" />
                            )}
                            Invite
                        </button>
                    </div>
                </div>

                {result && (
                    <div className={`p-3 rounded-md text-sm flex items-center ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                        {result.success ? (
                            <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
                        ) : (
                            <ShieldAlert className="w-4 h-4 mr-2 flex-shrink-0" />
                        )}
                        {result.message}
                    </div>
                )
                }
            </form >
        </div >
    );
}
