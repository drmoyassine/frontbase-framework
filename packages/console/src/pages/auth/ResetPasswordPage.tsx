import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isCloud } from '@/lib/edition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2 } from 'lucide-react';



export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const email = searchParams.get('email') || '';

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [website, setWebsite] = useState('');
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';

    useEffect(() => {
        if (!siteKey || !token) return;

        const scriptId = 'cloudflare-turnstile-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback';
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);

            (window as any).onloadTurnstileCallback = () => {
                try {
                    (window as any).turnstile.render('#turnstile-container', {
                        sitekey: siteKey,
                        callback: (token: string) => {
                            setTurnstileToken(token);
                        },
                    });
                } catch (e) {
                    console.error('Turnstile render error', e);
                }
            };
        } else if ((window as any).turnstile) {
            try {
                (window as any).turnstile.render('#turnstile-container', {
                    sitekey: siteKey,
                    callback: (token: string) => {
                        setTurnstileToken(token);
                    },
                });
            } catch (e) {
                // Ignore fast re-render conflicts
            }
        }
    }, [siteKey, token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!token) {
            setErrorMessage('Reset token is missing from the link.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            return;
        }

        if (password.length < 8) {
            setErrorMessage('Password must be at least 8 characters long.');
            return;
        }

        setIsLoading(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            if (isCloud()) {
                // Cloud mode: SuperTokens reset password API
                const response = await fetch(`/api/auth/user/password/reset`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'rid': 'emailpassword'
                    },
                    body: JSON.stringify({
                        formFields: [{ id: 'password', value: password }],
                        token: token,
                        website,
                        turnstile_token: turnstileToken || undefined
                    })
                });

                const data = await response.json();
                if (!response.ok || data.status !== 'OK') {
                    const detail = data.status === 'RESET_PASSWORD_INVALID_TOKEN_ERROR' 
                        ? 'The reset link has expired or is invalid.' 
                        : (data.formFields?.[0]?.error || 'Failed to reset password.');
                    setErrorMessage(detail);
                } else {
                    setSuccessMessage('Your password has been successfully reset.');
                }
            } else {
                // Self-Hosted mode: custom reset-password API
                const response = await fetch(`/api/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        token,
                        password,
                        website,
                        turnstile_token: turnstileToken || undefined
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    setErrorMessage(data.detail || 'Failed to reset password.');
                } else {
                    setSuccessMessage(data.message || 'Your password has been successfully reset.');
                }
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold">New Password</CardTitle>
                    <CardDescription>
                        Set a new password for your account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!token ? (
                        <div className="space-y-4">
                            <Alert variant="destructive">
                                <AlertDescription>
                                    This password reset link is invalid or has expired. Please request a new reset link.
                                </AlertDescription>
                            </Alert>
                            <p className="text-center text-sm text-muted-foreground pt-2">
                                Go to{' '}
                                <Link to="/forgot-password" className="text-primary hover:underline font-medium">
                                    Request Reset Link
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {errorMessage && (
                                <Alert variant="destructive">
                                    <AlertDescription>{errorMessage}</AlertDescription>
                                </Alert>
                            )}

                            {successMessage && (
                                <div className="space-y-4">
                                    <Alert variant="default" className="border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                        <AlertTitle>Success</AlertTitle>
                                        <AlertDescription>{successMessage}</AlertDescription>
                                    </Alert>
                                    <Button asChild className="w-full">
                                        <Link to="/login">Sign In</Link>
                                    </Button>
                                </div>
                            )}

                            {!successMessage && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">New Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                                        <Input
                                            id="confirmPassword"
                                            type="password"
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>

                                    {/* Honeypot field - invisible to users, auto-filled by bots */}
                                    <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0, overflow: 'hidden' }} aria-hidden="true">
                                        <label htmlFor="website">Leave this field blank</label>
                                        <input
                                            id="website"
                                            type="text"
                                            name="website"
                                            tabIndex={-1}
                                            autoComplete="off"
                                            value={website}
                                            onChange={(e) => setWebsite(e.target.value)}
                                        />
                                    </div>

                                    {siteKey && !successMessage && (
                                        <div id="turnstile-container" className="flex justify-center py-2" />
                                    )}

                                    <Button type="submit" className="w-full" disabled={isLoading}>
                                        {isLoading ? 'Resetting Password...' : 'Reset Password'}
                                    </Button>

                                    <p className="text-center text-sm text-muted-foreground pt-2">
                                        Back to{' '}
                                        <Link to="/login" className="text-primary hover:underline font-medium">
                                            Sign In
                                        </Link>
                                    </p>
                                </>
                            )}
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
