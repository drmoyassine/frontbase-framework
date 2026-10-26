import { useEffect, useState } from 'react';
import { loginProductAdmin, postSetup, type SetupStatus } from '@/lib/api';
import { authorizeInitialSetupClaim } from '@/lib/setup-claim';

const PRODUCT_DASHBOARD = '/frontbase-admin/dashboard';
const PRODUCT_LOGIN = '/frontbase-admin/login';

export function Setup({ status }: { status: SetupStatus }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [claimAuthorized, setClaimAuthorized] = useState(false);
    const [checkingClaim, setCheckingClaim] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { setupEnabled, setupExpired } = status;

    useEffect(() => {
        let active = true;
        const authorize = () => { void authorizeInitialSetupClaim(setupEnabled)
            .then((authorized) => {
                if (active && authorized) setClaimAuthorized(true);
            })
            .catch((err) => {
                if (!active) return;
                setError(err instanceof Error ? err.message : 'The setup link is invalid or expired');
            })
            .finally(() => {
                if (active) setCheckingClaim(false);
            });
        };
        authorize();
        window.addEventListener('hashchange', authorize);
        return () => { active = false; window.removeEventListener('hashchange', authorize); };
    }, [setupEnabled]);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);

        try {
            if (!claimAuthorized) throw new Error('Open a valid secure setup link before creating an administrator.');
            await postSetup(email, password);
            try {
                await loginProductAdmin(email, password);
                window.location.replace(PRODUCT_DASHBOARD);
            } catch {
                // Setup is now locked. Leave this artifact even if the automatic
                // login unexpectedly fails and let the product console retry.
                window.location.replace(PRODUCT_LOGIN);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Setup failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="mx-auto max-w-lg px-6 py-12">
            <h1 className="text-3xl font-semibold">Initial setup</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Create the first admin account for this deployment.
            </p>

            {checkingClaim && (
                <p className="mt-8 rounded border px-4 py-3 text-sm text-muted-foreground">
                    Verifying your secure setup link…
                </p>
            )}

            {!checkingClaim && setupExpired && (
                <p className="mt-8 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This setup link has expired. Generate a new link from the deployment command and try again.
                </p>
            )}

            {!checkingClaim && !setupEnabled && !setupExpired && (
                <p className="mt-8 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Secure browser setup is not enabled for this deployment. Redeploy the same app with <code>--setup-link</code>, or seed an administrator from the deployment command.
                </p>
            )}

            {!checkingClaim && setupEnabled && claimAuthorized && (
                <p className="mt-8 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Secure setup link verified. Choose the first administrator credentials below.
                </p>
            )}

            {!checkingClaim && setupEnabled && !claimAuthorized && (
                <p className="mt-8 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Open the secure setup link provided when you deployed Frontbase. If it has expired, generate a new setup link for this installation.
                </p>
            )}

            {!checkingClaim && setupEnabled && claimAuthorized && <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="setup-email" className="block text-sm font-medium text-muted-foreground">Email</label>
                    <input
                        className="mt-2 w-full rounded border px-3 py-2"
                        id="setup-email"
                        type="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="setup-password" className="block text-sm font-medium text-muted-foreground">Password</label>
                    <input
                        className="mt-2 w-full rounded border px-3 py-2"
                        id="setup-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-muted-foreground">Confirm password</label>
                    <input
                        className="mt-2 w-full rounded border px-3 py-2"
                        id="setup-confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                    />
                </div>
                <button
                    type="button"
                    aria-controls="setup-password setup-confirm-password"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(value => !value)}
                    className="rounded border px-3 py-2 text-sm"
                >
                    {showPassword ? 'Hide passwords' : 'Show passwords'}
                </button>
                <p className="text-sm text-muted-foreground">
                    Check your email before continuing. Save these credentials in your password manager.
                    Password-reset email requires mail delivery to be configured for this installation.
                </p>
                {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {loading ? 'Setting up…' : 'Create admin account'}
                </button>
            </form>}
        </main>
    );
}
