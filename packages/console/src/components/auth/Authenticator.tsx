import { useEffect, useMemo, useState, type FormEvent } from 'react';
import qrcode from 'qrcode-generator';
import { startAuthentication } from '@simplewebauthn/browser';
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

function AuthenticatorQr({secret, accountEmail}: {secret:string;accountEmail?:string}) {
    const qr = useMemo(() => {
        try {
            const issuer = 'Frontbase';
            const account = [accountEmail, window.location.hostname].filter(Boolean).join(' @ ');
            const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
            const params = new URLSearchParams({secret,issuer,algorithm:'SHA1',digits:'6',period:'30'});
            const code = qrcode(0,'M');
            code.addData('otpauth://totp/' + label + '?' + params.toString());
            code.make();
            const count = code.getModuleCount();
            const quietZone = 4;
            const modules: string[] = [];
            for (let row = 0; row < count; row++) {
                for (let column = 0; column < count; column++) {
                    if (code.isDark(row,column)) modules.push('M' + (column+quietZone) + ',' + (row+quietZone) + 'h1v1h-1z');
                }
            }
            return {size:count + 2*quietZone,path:modules.join('')};
        } catch {
            return null;
        }
    },[secret,accountEmail]);

    return <div className="space-y-3">
        {qr ? <>
            <p>Scan this QR code with your authenticator app.</p>
            <svg role="img" aria-label="Authenticator setup QR code" className="block h-auto w-56 max-w-full rounded p-0"
                viewBox={'0 0 ' + qr.size + ' ' + qr.size} shapeRendering="crispEdges">
                <rect width={qr.size} height={qr.size} fill="#fff" />
                <path d={qr.path} fill="#000" />
            </svg>
        </> : <p role="status">The QR code is unavailable. You can enter the setup key manually.</p>}
        <details open={qr ? undefined : true}>
            <summary className="w-fit cursor-pointer underline">Enter setup key manually</summary>
            <p className="mt-2">Choose a time-based account in your authenticator app and enter this key.</p>
            <code className="mt-2 block break-all rounded border p-3 select-all">{secret}</code>
        </details>
    </div>;
}

function RecoveryCodes({codes}: {codes:string[]}) {
    return <>
        <ul className="rounded border p-3 font-mono text-sm break-all select-all">{codes.map(code=><li key={code}>{code}</li>)}</ul>
        <label className="flex items-center gap-2"><input type="checkbox" name="saved" required /> I saved my recovery codes.</label>
    </>;
}

export function RecoveryCodeRenewal() {
    const [pending,setPending] = useState<Pick<Enrollment,'recoveryCodes'|'ticket'>>();
    const [busy,setBusy] = useState(false);
    const [status,setStatus] = useState('');
    const [error,setError] = useState('');
    async function requestOptions() {
        setBusy(true);
        setStatus('');
        setError('');
        try { setPending(await authenticatorRequest('recovery-codes/options/',{})); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate recovery codes.'); }
        finally { setBusy(false); }
    }
    async function confirm(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!pending) return;
        const fields = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
            const result = await authenticatorRequest('recovery-codes/confirm/',{
                ticket:pending.ticket,password:fields.get('password'),code:fields.get('code'),saved:fields.has('saved'),
            });
            setPending(undefined);
            setStatus(result.message);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not replace recovery codes.'); }
        finally { setBusy(false); }
    }
    return <Card>
        <CardHeader><CardTitle>Recovery codes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            {status && <p role="status">{status}</p>}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            {pending ? <form onSubmit={confirm} className="space-y-4">
                <p>Save these codes offline. Confirming the replacement invalidates your previous codes.</p>
                <RecoveryCodes codes={pending.recoveryCodes} />
                <div><Label htmlFor="renew-password">Current password</Label>
                    <Input id="renew-password" name="password" type="password" autoComplete="current-password" maxLength={256} required /></div>
                <div><Label htmlFor="renew-code">Fresh authenticator code</Label>
                    <Input id="renew-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></div>
                <Button disabled={busy}>Replace recovery codes</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setPending(undefined);setError('');}}>Cancel</Button>
            </form> : <Button type="button" variant="outline" disabled={busy} onClick={()=>void requestOptions()}>Generate new recovery codes</Button>}
        </CardContent>
    </Card>;
}

export function AuthenticatorSetup({required = false,mailAvailable = false,accountEmail}: {required?:boolean;mailAvailable?:boolean;accountEmail?:string}) {
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
                    <AuthenticatorQr secret={pending.secret} accountEmail={accountEmail} />
                    <p>Save these one-time recovery codes offline. To reset your password, use one recovery code and a fresh authenticator code.</p>
                    <RecoveryCodes codes={pending.recoveryCodes} />
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

async function recoveryCall(path: string, body: object) {
    const response = await fetch(path,{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok || !result) throw Error(result?.detail ?? 'Password recovery is unavailable.');
    return result;
}

export function AuthenticatorRecovery() {
    const [passkeyAvailable,setPasskeyAvailable] = useState(false);
    const [method,setMethod] = useState<'authenticator'|'passkey'>('authenticator');
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const navigate = useNavigate();
    useEffect(()=>{
        if (!window.PublicKeyCredential) return;
        const controller = new AbortController();
        void fetch('/api/passkeys/recovery/availability/',{cache:'no-store',signal:controller.signal})
            .then(response=>response.ok ? response.json() : null)
            .then(result=>{if(result?.enabled)setPasskeyAvailable(true);}).catch(()=>{});
        return ()=>controller.abort();
    },[]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const password = fields.get('password');
        if (password !== fields.get('confirm')) { setError('The new passwords do not match.'); return; }
        setBusy(true);
        setError('');
        try {
            const input = {email:fields.get('email'),backup:String(fields.get('backup')??'').trim().toLowerCase(),password};
            let result;
            if (method === 'passkey') {
                const optionsJSON = await recoveryCall('/api/passkeys/recovery/options/',{});
                const assertion = await startAuthentication({optionsJSON});
                result = await recoveryCall('/api/passkeys/recovery/verify/',{...input,assertion});
            } else {
                result = await recoveryCall('/api/auth/recover-with-authenticator/',{...input,code:fields.get('code')});
            }
            await useAuthStore.getState().logout();
            navigate('/login',{replace:true,state:{accountMessage:result.message}});
        } catch (cause) {
            setError(cause instanceof Error && cause.name !== 'NotAllowedError' ? cause.message : 'Recovery was canceled or could not be completed. Try again.');
        } finally { setBusy(false); }
    }
    return <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
            <CardHeader><CardTitle>Recover with a recovery code</CardTitle></CardHeader>
            <CardContent>
                <form onSubmit={submit} className="space-y-4">
                    {error && <p role="alert" className="text-destructive">{error}</p>}
                    {passkeyAvailable && <fieldset className="space-y-2" disabled={busy}>
                        <legend className="mb-2 text-sm font-medium">Verification method</legend>
                        <label className="flex items-center gap-2"><input type="radio" name="method" checked={method==='authenticator'} onChange={()=>{setMethod('authenticator');setError('');}} /> Authenticator app</label>
                        <label className="flex items-center gap-2"><input type="radio" name="method" checked={method==='passkey'} onChange={()=>{setMethod('passkey');setError('');}} /> Passkey</label>
                    </fieldset>}
                    <div><Label htmlFor="recovery-email">Sign-in email</Label><Input id="recovery-email" name="email" type="email" autoComplete="username" required /></div>
                    {method==='authenticator' && <div><Label htmlFor="recovery-authenticator-code">Authenticator code</Label><Input id="recovery-authenticator-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div>}
                    <div><Label htmlFor="recovery-backup">Unused recovery code</Label><Input id="recovery-backup" name="backup" autoComplete="off" maxLength={32} required /></div>
                    <div><Label htmlFor="recovery-password">New password</Label><Input id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
                    <div><Label htmlFor="recovery-confirm">Confirm new password</Label><Input id="recovery-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>
                    <Button disabled={busy}>{method==='passkey' ? 'Verify passkey and reset password' : 'Reset password'}</Button>
                    <Button asChild variant="link"><Link to="/login">Back to sign-in</Link></Button>
                </form>
            </CardContent>
        </Card>
    </main>;
}
