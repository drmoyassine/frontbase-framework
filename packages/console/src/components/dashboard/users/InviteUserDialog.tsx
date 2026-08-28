import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, CheckCircle2, ShieldAlert } from 'lucide-react';
import { usersApi } from '@/services/usersApi';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInvited?: () => void;
}

/**
 * Invite an app user (GoTrue) by email. Mirrors the AdminInviteForm pattern but
 * targets the tenant's Supabase auth provider via /api/users/invite.
 */
export const InviteUserDialog: React.FC<Props> = ({ open, onOpenChange, onInvited }) => {
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setSending(true);
        setResult(null);
        try {
            const res = await usersApi.invite({ email });
            setResult({ success: true, message: `Invitation sent to ${email}` });
            setEmail('');
            onInvited?.();
            void res;
        } catch (err: any) {
            setResult({
                success: false,
                message: err.response?.data?.detail || err.message || 'Failed to send invitation',
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Invite app user</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-email">Email address</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                            disabled={sending}
                        />
                        <p className="text-xs text-muted-foreground">
                            Creates the user in the connected auth provider and sends an invitation email.
                        </p>
                    </div>

                    {result && (
                        <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${result.success ? 'border-green-200 bg-green-50 text-green-700' : 'border-destructive/20 bg-destructive/10 text-destructive'}`}>
                            {result.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                            <span>{result.message}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                            Close
                        </Button>
                        <Button type="submit" disabled={sending || !email}>
                            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                            Invite
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
