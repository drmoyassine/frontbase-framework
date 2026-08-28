/**
 * SignupPage - Cloud Account Registration
 *
 * Creates a new user + tenant + default project.
 * Only available in cloud mode (DEPLOYMENT_MODE=cloud).
 *
 * Uses the AuthClient abstraction layer which supports:
 * - SuperTokens (default cloud mode)
 * - Supabase (when AUTH_PROVIDER=supabase)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);

  const { signup, isLoading, error, clearError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Auto-generate slug from workspace name (unless manually edited)
  useEffect(() => {
    if (!slugManual && workspaceName) {
      setSlug(slugify(workspaceName));
    }
  }, [workspaceName, slugManual]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugError(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-slug/${encodeURIComponent(slug)}`);
        const data = await res.json();
        setSlugAvailable(data.available);
        setSlugError(data.error || null);
      } catch {
        setSlugAvailable(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleSlugChange = useCallback((value: string) => {
    setSlugManual(true);
    setSlug(slugify(value));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setPasswordError(null);

    // Validate passwords
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (!slugAvailable) {
      return;
    }

    const result = await signup({
      email,
      password,
      workspaceName,
      slug,
    });
    if (result.success) {
      // Email confirmation enabled: Supabase created the user but defers the
      // session until they confirm. Show a "check your email" state instead of
      // navigating to the dashboard (they can't log in until confirmed).
      if (result.requiresVerification) {
        setVerificationSent(true);
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  };

  const formError = error || passwordError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
          <CardDescription>
            Start building with Frontbase — free forever
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verificationSent ? (
            <div className="space-y-4">
              <Alert className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-none">
                <AlertDescription>
                  We sent a confirmation link to <strong>{email}</strong>. Click the
                  link in the email to activate your account, then{' '}
                  <Link to="/login" className="underline font-medium">sign in</Link>.
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                Didn&apos;t get the email? Check your spam folder, or{' '}
                <button
                  type="button"
                  className="text-primary underline font-medium"
                  onClick={() => setVerificationSent(false)}
                >
                  try again with a different address
                </button>.
              </p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
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
              <Label htmlFor="signup-confirm-password">Confirm Password</Label>
              <Input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-workspace">Workspace Name</Label>
              <Input
                id="signup-workspace"
                type="text"
                placeholder="My Company"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-slug">Workspace URL</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="signup-slug"
                  type="text"
                  placeholder="my-company"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                  maxLength={30}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  .frontbase.dev
                </span>
              </div>
              {slug.length >= 3 && slugAvailable === true && !slugError && (
                <p className="text-xs text-green-600">✓ Available</p>
              )}
              {slug.length >= 3 && slugAvailable === false && (
                <p className="text-xs text-destructive">
                  {slugError || 'This workspace URL is already taken'}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !slugAvailable || slug.length < 3}
            >
              {isLoading ? 'Creating workspace...' : 'Create Workspace'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
