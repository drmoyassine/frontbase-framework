import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle } from '@/components/ui/alert';

export function Login() {
    const { user, loading, login, error, refresh } = useAuthStore();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { if (!user && loading) refresh(); }, []); // probe session on mount
    useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user, navigate]);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try { await login(email, password); navigate('/dashboard', { replace: true }); }
        catch { /* error surfaced via store */ }
        finally { setSubmitting(false); }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                                <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                                <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold">Frontbase</span>
                    </div>
                    <CardTitle>Sign in to your console</CardTitle>
                    <CardDescription>Use the admin credentials seeded at deploy.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" required autoComplete="email"
                                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" required autoComplete="current-password"
                                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                        </div>
                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>{error === 'invalid_credentials' ? 'Invalid email or password' : 'Sign-in failed'}</AlertTitle>
                            </Alert>
                        )}
                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? 'Signing in…' : 'Sign in'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
