import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth';

export async function authenticatorRequest(path = '', body?: object) {
    const response = await fetch('/api/account/authenticator/' + path, {
        cache:'no-store', credentials:'same-origin',
        ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}),
    });
    if (response.status === 404 && !body) return {available:false,enrolled:false,required:false} as const;
    const result = await response.json().catch(()=>null);
    if (!response.ok || !result) throw Error(result?.detail ?? 'Authenticator status is unavailable. Try again.');
    return result;
}

type Enrollment = {secret:string;recoveryCodes:string[];ticket:string};

export function AuthenticatorSetup({required = false,mailAvailable = false}: {required?:boolean;mailAvailable?:boolean}) {
    const [emailStep,setEmailStep] = useState(false);
    const [pending,setPending] = useState<Enrollment>();
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const navigate = useNavigate();
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        setBusy(true);
        setError('');
        try {
            if (!pending) {
                const options = await authenticatorRequest('options/',{password:fields.get('password')});
                form.reset();
                setPending(options);
            } else {
                await authenticatorRequest('confirm/',{ticket:pending.ticket,code:fields.get('code'),saved:fields.has('saved')});
                setPending(undefined);
                await useAuthStore.getState().logout();
                navigate('/login',{replace:true,state:{accountMessage:'Authenticator enabled. Use a fresh code when you sign in.'}});
            }
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authenticator setup failed.'); }
        finally { setBusy(false); }
    }
    async function verifyEmail(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const code = event ? new FormData(event.currentTarget).get('mailCode') : undefined;
        setBusy(true);
        setError('');
        try {
            if (event) {
                await authenticatorRequest('mail/confirm/',{code});
                window.location.reload();
            } else {
                await authenticatorRequest('mail/',{});
                setEmailStep(true);
            }
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Email verification failed.'); }
        finally { setBusy(false); }
    }
    return <Card className="w-full max-w-xl">
        <CardHeader><CardTitle>{required ? 'Secure your administrator account' : 'Set up an authenticator'}</CardTitle></CardHeader>
        <CardContent>
            {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
            {emailStep ? <form className="space-y-4" onSubmit={verifyEmail}>
                <div><Label htmlFor="setup-recovery-mail-code">Code sent to your sign-in email</Label>
                    <Input id="setup-recovery-mail-code" name="mailCode" autoComplete="one-time-code" required pattern="[a-f0-9]{32}" maxLength={32} /></div>
                <Button disabled={busy}>Verify email</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={()=>setEmailStep(false)}>Use an authenticator</Button>
            </form> :             <form key={pending ? 'verify' : 'start'} onSubmit={submit} className="space-y-4">
                {pending ? <>
                    <p>In your authenticator app add a time-based account with this setup key.</p>
                    <code className="block break-all rounded border p-3 select-all">{pending.secret}</code>
                    <p>Save these one-time recovery codes offline. To reset your password, use one recovery code and a fresh authenticator code.</p>
                    <ul className="rounded border p-3 font-mono text-sm break-all select-all">{pending.recoveryCodes.map(code=><li key={code}>{code}</li>)}</ul>
                    <label className="flex items-center gap-2"><input type="checkbox" name="saved" required /> I saved my recovery codes.</label>
                    <div><Label htmlFor="setup-authenticator-code">Authenticator code</Label>
                        <Input id="setup-authenticator-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></div>
                    <Button disabled={busy}>Enable authenticator</Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setPending(undefined);setError('');}}>Start over</Button>
                </> : <>
                    {required && <p>{mailAvailable ? 'Verify your recovery email or set up an authenticator and save recovery codes.' : 'Set up an authenticator and save recovery codes to finish setup without email.'}</p>}
                    <div><Label htmlFor="setup-authenticator-password">Current password</Label>
                        <Input id="setup-authenticator-password" name="password" type="password" autoComplete="current-password" maxLength={256} required /></div>
                    <Button disabled={busy}>Continue</Button>
                    {mailAvailable && <Button type="button" variant="outline" disabled={busy} onClick={()=>void verifyEmail()}>Verify recovery email instead</Button>}
                </>}
            </form>}
        </CardContent>
    </Card>;
}

export function AuthenticatorRecovery() {
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const navigate = useNavigate();
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const password = fields.get('password');
        if (password !== fields.get('confirm')) { setError('The new passwords do not match.'); return; }
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/auth/recover-with-authenticator/',{
                method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({email:fields.get('email'),code:fields.get('code'),
                    backup:String(fields.get('backup')??'').trim().toLowerCase(),password}),
            });
            const result = await response.json().catch(()=>null);
            if (!response.ok) throw Error(result?.detail ?? 'Authenticator recovery is unavailable.');
            await useAuthStore.getState().logout();
            navigate('/login',{replace:true,state:{accountMessage:result.message}});
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Recovery failed.'); }
        finally { setBusy(false); }
    }
    return <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Recover with an authenticator</CardTitle></CardHeader>
            <CardContent>
                <form onSubmit={submit} className="space-y-4">
                    {error && <p role="alert" className="text-destructive">{error}</p>}
                    <div><Label htmlFor="recovery-email">Sign-in email</Label><Input id="recovery-email" name="email" type="email" autoComplete="username" required /></div>
                    <div><Label htmlFor="recovery-authenticator-code">Authenticator code</Label><Input id="recovery-authenticator-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>
                    <div><Label htmlFor="recovery-backup">Unused recovery code</Label><Input id="recovery-backup" name="backup" autoComplete="off" maxLength={32} required /></div>
                    <div><Label htmlFor="recovery-password">New password</Label><Input id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
                    <div><Label htmlFor="recovery-confirm">Confirm new password</Label><Input id="recovery-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
                    <Button disabled={busy}>Reset password</Button>
                    <Button asChild variant="link"><Link to="/login">Back to sign-in</Link></Button>
                </form>
            </CardContent>
        </Card>
    </main>;
}
