import { AuthenticatorSetup, authenticatorRequest } from '@/components/auth/Authenticator';
import { startRegistration } from '@simplewebauthn/browser';

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth';

type Passkey = {id:string;name:string;createdAt:string};
type Passkeys = {enabled:boolean;passkeys:Passkey[]};
type Account = { email: string; changePassword: boolean; changeEmail: boolean };
async function request(path: string, body?: unknown, code?: string) {
    const response = await fetch('/api/account/' + path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(code ? {'X-Frontbase-Authenticator-Code':code} : {}) }, body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new Error(result?.detail ?? 'The request could not be completed.');
    return result;
}

export function MyAccount() {
    const [authenticator,setAuthenticator] = useState<{enrolled:boolean;available:boolean}>();
    const [account, setAccount] = useState<Account>();
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [passkeys, setPasskeys] = useState<Passkeys>();
    const [verifying, setVerifying] = useState(false);
    const navigate = useNavigate();
    const logout = useAuthStore(state => state.logout);
    useEffect(() => {
        let active = true;
        void request('').then(data => { if (active) setAccount(data); }, reason => { if (active) setError(reason.message); });
        void authenticatorRequest().then(data=>{if(active)setAuthenticator(data);}).catch(()=>{});
        void request('passkeys/').then(data=>{if(active)setPasskeys(data);}).catch(()=>{});
        return () => { active = false; };
    }, []);

    async function submit(event: FormEvent<HTMLFormElement>, action: 'password/' | 'email/' | 'email/confirm/') {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        const currentPassword = String(fields.get('currentPassword') ?? '');
        let input: Record<string, string> = { currentPassword };
        if (action === 'password/') {
            const newPassword = String(fields.get('newPassword') ?? '');
            if (newPassword !== fields.get('confirmPassword')) {
                setError('The new passwords do not match.');
                return;
            }
            input = { ...input, newPassword };
        } else if (action === 'email/') {
            input = { ...input, newEmail: String(fields.get('newEmail') ?? '') };
        } else {
            input = { ...input, code: String(fields.get('code') ?? '').trim().toLowerCase() };
        }
        setError('');
        setMessage('');
        setBusy(true);
        try {
            const result = await request(action, input,String(fields.get('authenticatorCode') ?? ''));
            form.reset();
            if (action === 'email/') {
                setMessage(result.message);
                setVerifying(true);
            } else {
                await logout();
                navigate('/login', { replace: true, state: { accountMessage: result.message } });
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The change could not be completed.');
        } finally {
            setBusy(false);
        }
    }

    async function managePasskey(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if(busy)return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        const password = String(fields.get('password') ?? '');
        const id = String(fields.get('remove') ?? '');
        const code = String(fields.get('authenticatorCode') ?? '');
        setBusy(true);setError('');setMessage('');
        try {
            if (id) {
                await request('passkeys/remove/',{id,password},code);
                setMessage('Passkey removed.');
            } else {
                const optionsJSON = await request('passkeys/options/',{password,name:String(fields.get('name') ?? '')},code);

                const proof = await startRegistration({optionsJSON});
                await request('passkeys/verify/',proof);
                setMessage('Passkey added.');
            }
            form.reset();
            setPasskeys(await request('passkeys/'));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not update passkeys.');
        } finally { setBusy(false); }
    }

    return <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-semibold">My account</h1>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {message && <p role="status">{message}</p>}
        {authenticator?.available && (authenticator.enrolled
            ? <p role="status">Authenticator enabled. Keep your recovery codes somewhere safe.</p> : <AuthenticatorSetup />)}
        {passkeys?.enabled && window.PublicKeyCredential && <Card>
            <CardHeader><CardTitle>Passkeys</CardTitle><CardDescription>Add a passkey to sign in with your device. Your password remains available for recovery.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
                {passkeys.passkeys.length>0 && <ul className="space-y-3">
                    {passkeys.passkeys.map(key=><li key={key.id} className="rounded-md border p-3">
                        <div className="font-medium">{key.name}</div>
                        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={event=>void managePasskey(event)}>
                            <div><Label htmlFor={'remove-'+key.id}>Current password</Label><Input id={'remove-'+key.id} name="password" type="password" autoComplete="current-password" required maxLength={256} /></div>
                            {authenticator?.enrolled && <div><Label htmlFor={'remove-code-'+key.id}>Fresh authenticator code</Label><Input id={'remove-code-'+key.id} name="authenticatorCode" inputMode="numeric" pattern="[0-9]{6}" required /></div>}
                            <input type="hidden" name="remove" value={key.id}/>
                            <Button type="submit" variant="outline" disabled={busy}>Remove</Button>
                        </form>
                    </li>)}
                </ul>}
                <form className="space-y-4" onSubmit={event=>void managePasskey(event)}>
                    <div><Label htmlFor="passkey-name">Passkey name</Label><Input id="passkey-name" name="name" placeholder="Work laptop" required maxLength={80} /></div>
                    <div><Label htmlFor="passkey-password">Current password</Label><Input id="passkey-password" name="password" type="password" autoComplete="current-password" required maxLength={256} /></div>
                    {authenticator?.enrolled && <div><Label htmlFor="passkey-authenticator">Fresh authenticator code</Label><Input id="passkey-authenticator" name="authenticatorCode" inputMode="numeric" pattern="[0-9]{6}" required /></div>}
                    <Button variant="outline" disabled={busy}>Add passkey</Button>
                </form>
            </CardContent>
        </Card>}
        {account && <>
            <p className="text-sm text-muted-foreground">Sign-in email <span className="font-medium text-foreground">{account.email}</span></p>
            <Card>
                <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Your sessions end after the change. Sign in again with the new password.</CardDescription></CardHeader>
                <CardContent>{account.changePassword ? <form className="space-y-4" onSubmit={event => void submit(event, 'password/')}>
                    <div><Label htmlFor="pw-current">Current password</Label><Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></div>
                    <div><Label htmlFor="pw-new">New password</Label><Input id="pw-new" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></div>
                    <div><Label htmlFor="pw-confirm">Confirm new password</Label><Input id="pw-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></div>
                    {authenticator?.enrolled && <div><Label htmlFor="pw-authenticator">Fresh authenticator code</Label><Input id="pw-authenticator" name="authenticatorCode" inputMode="numeric" pattern="[0-9]{6}" required /></div>}
                    <Button disabled={busy}>Change password</Button>
                </form> : <p>Password changes are managed by your sign-in provider or deployment administrator.</p>}</CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Change email</CardTitle><CardDescription>Verify the new address before it becomes your sign-in email.</CardDescription></CardHeader>
                <CardContent>{account.changeEmail ? <form key={String(verifying)} className="space-y-4" onSubmit={event => void submit(event, verifying ? 'email/confirm/' : 'email/')}>
                    {verifying
                        ? <div><Label htmlFor="email-code">Verification code</Label><Input id="email-code" name="code" autoComplete="one-time-code" required maxLength={32} /></div>
                        : <div><Label htmlFor="email-new">New email</Label><Input id="email-new" name="newEmail" type="email" autoComplete="email" required maxLength={254} /></div>}
                    <div><Label htmlFor="email-current">Current password</Label><Input id="email-current" name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></div>
                    {authenticator?.enrolled && <div><Label htmlFor="email-authenticator">Fresh authenticator code</Label><Input id="email-authenticator" name="authenticatorCode" inputMode="numeric" pattern="[0-9]{6}" required /></div>}
                    <div className="flex flex-wrap gap-2">
                        <Button disabled={busy}>{verifying ? 'Confirm email change' : 'Send verification code'}</Button>
                        {verifying && <Button type="button" variant="ghost" disabled={busy} onClick={() => setVerifying(false)}>Start over</Button>}
                    </div>
                </form> : <p>Email changes require a local account and a configured mail provider.</p>}</CardContent>
            </Card>
        </>}
    </div>;
}
