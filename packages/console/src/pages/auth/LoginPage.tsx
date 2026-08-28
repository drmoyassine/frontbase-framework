/**
 * LoginPage - Admin Authentication
 *
 * Simple login page for Frontbase admin/designers.
 * Uses session-based auth via FastAPI backend (self-host) or
 * JWT-based auth via SuperTokens/Supabase (cloud).
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/useAuth';
import { isCloud } from '@/lib/edition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [website, setWebsite] = useState('');
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const { login, isLoading, error, clearError, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';

    // Get redirect destination (default to dashboard, not landing page)
    const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

    // Auto-redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            const redirectPath = from === '/login' || from === '/signup' ? '/dashboard' : from;
            navigate(redirectPath, { replace: true });
        }
    }, [isAuthenticated, navigate, from]);

    useEffect(() => {
        if (!siteKey) return;

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
    }, [siteKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        const result = await login({
            email,
            password,
            website,
            turnstileToken: turnstileToken || undefined,
        });
        if (result.success) {
            navigate(from, { replace: true });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold">Frontbase</CardTitle>
                    <CardDescription>
                        Sign in to access the builder
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                                    Forgot password?
                                </Link>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
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

                        {siteKey && (
                            <div id="turnstile-container" className="flex justify-center py-2" />
                        )}

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </Button>

                        {isCloud() && (
                            <p className="text-center text-sm text-muted-foreground">
                                Don&apos;t have an account?{' '}
                                <Link to="/signup" className="text-primary hover:underline font-medium">
                                    Sign up
                                </Link>
                            </p>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
