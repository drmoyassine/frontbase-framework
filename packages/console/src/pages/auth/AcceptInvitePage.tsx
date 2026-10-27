/**
 * AcceptInvitePage — join an existing workspace via an emailed invite token.
 *
 * Public route (/accept-invite?token=...). Fetches the invite, lets the invitee
 * set a password, then creates their account + attaches them to the tenant.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface InviteInfo {
  email: string;
  role: string;
  tenant_name: string | null;
  tenant_slug: string | null;
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('Missing invite token.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLoadError(data.detail || 'This invite is invalid, revoked, or expired.');
        } else {
          setInvite(await res.json());
        }
      } catch {
        setLoadError('Could not load the invitation.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.detail || 'Could not accept the invitation.');
        setSubmitting(false);
        return;
      }
      // Session cookie is set by the backend — full reload re-initializes auth.
      window.location.href = '/dashboard';
    } catch {
      setFormError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {loading ? (
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : loadError ? (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Invitation unavailable</CardTitle>
              <CardDescription>{loadError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/login" className="text-primary hover:underline font-medium text-sm">
                Go to sign in
              </Link>
            </CardContent>
          </>
        ) : invite ? (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">
                Join {invite.tenant_name || 'the workspace'}
              </CardTitle>
              <CardDescription>
                You've been invited as a <strong>{invite.role}</strong>. Set a password to accept.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input id="invite-email" type="email" value={invite.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-confirm">Confirm Password</Label>
                  <Input
                    id="invite-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Joining…' : 'Accept & Join'}
                </Button>
              </form>
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  );
}
