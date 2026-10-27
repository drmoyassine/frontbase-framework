/**
 * CloudflareDeployForm
 * 
 * One-click Cloudflare Workers deployment from Settings UI.
 * Enter API token → click Deploy → Worker is uploaded, secrets set,
 * and deployment target auto-registered.
 */

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, Cloud, Rocket, Check, X, ExternalLink,
    AlertTriangle, Trash2, Eye, EyeOff, Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = '';

interface CloudflareDeployFormProps {
    withCard?: boolean;
}

type DeployStatus = 'idle' | 'deploying' | 'deployed' | 'error' | 'tearing-down';

export const CloudflareDeployForm: React.FC<CloudflareDeployFormProps> = ({ withCard = false }) => {
    const [apiToken, setApiToken] = useState('');
    const [workerName, setWorkerName] = useState('frontbase-edge');
    const [accountId, setAccountId] = useState('');
    const [showToken, setShowToken] = useState(false);

    // Separate secret inputs (optional — pulled from Turso/Redis settings if empty)
    const [tursoUrl, setTursoUrl] = useState('');
    const [tursoToken, setTursoToken] = useState('');
    const [upstashUrl, setUpstashUrl] = useState('');
    const [upstashToken, setUpstashToken] = useState('');
    const [showSecrets, setShowSecrets] = useState(false);

    const [status, setStatus] = useState<DeployStatus>('idle');
    const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
    const [deployResult, setDeployResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Check existing deployment on mount (if token is stored)
    useEffect(() => {
        const savedToken = localStorage.getItem('cf_api_token');
        const savedWorkerName = localStorage.getItem('cf_worker_name');
        const savedAccountId = localStorage.getItem('cf_account_id');

        if (savedToken) {
            setApiToken(savedToken);
            if (savedWorkerName) setWorkerName(savedWorkerName);
            if (savedAccountId) setAccountId(savedAccountId);

            // Check status
            checkStatus(savedToken, savedWorkerName || 'frontbase-edge', savedAccountId || '');
        }
    }, []);

    const checkStatus = async (token: string, name: string, accId: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/cloudflare/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_token: token,
                    worker_name: name,
                    account_id: accId || undefined,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.deployed) {
                    setStatus('deployed');
                    setDeployedUrl(data.url);
                    setDeployResult(data);
                }
            }
        } catch {
            // Silently fail — not deployed or token expired
        }
    };

    const handleDeploy = async () => {
        if (!apiToken) return;
        setStatus('deploying');
        setError(null);

        try {
            const res = await fetch(`${API_BASE}/api/cloudflare/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_token: apiToken,
                    account_id: accountId || undefined,
                    worker_name: workerName,
                    turso_url: tursoUrl || undefined,
                    turso_token: tursoToken || undefined,
                    upstash_url: upstashUrl || undefined,
                    upstash_token: upstashToken || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.error || 'Deploy failed');
            }

            setStatus('deployed');
            setDeployedUrl(data.url);
            setDeployResult(data);

            // Save token + worker name for future status checks
            localStorage.setItem('cf_api_token', apiToken);
            localStorage.setItem('cf_worker_name', workerName);
            if (data.account_id) {
                setAccountId(data.account_id);
                localStorage.setItem('cf_account_id', data.account_id);
            }
        } catch (e: any) {
            setStatus('error');
            setError(e.message);
        }
    };

    const handleTeardown = async () => {
        if (!apiToken) return;
        setStatus('tearing-down');
        setError(null);

        try {
            const res = await fetch(`${API_BASE}/api/cloudflare/teardown`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_token: apiToken,
                    account_id: accountId || undefined,
                    worker_name: workerName,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || data.error || 'Teardown failed');
            }

            setStatus('idle');
            setDeployedUrl(null);
            setDeployResult(null);
            localStorage.removeItem('cf_api_token');
            localStorage.removeItem('cf_worker_name');
            localStorage.removeItem('cf_account_id');
        } catch (e: any) {
            setStatus('error');
            setError(e.message);
        }
    };

    const formContent = (
        <div className="space-y-5">
            {/* Deployed status banner */}
            {status === 'deployed' && deployedUrl && (
                <Alert className="border-green-500/50 bg-green-500/10">
                    <Check className="h-4 w-4 text-green-500" />
                    <AlertDescription className="flex items-center justify-between">
                        <span>
                            Worker deployed at{' '}
                            <a
                                href={deployedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium underline"
                            >
                                {deployedUrl}
                            </a>
                        </span>
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-500/50">
                            Live
                        </Badge>
                    </AlertDescription>
                </Alert>
            )}

            {/* Error */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* API Token */}
            <div className="space-y-2">
                <Label htmlFor="cf-token">Cloudflare API Token</Label>
                <div className="flex gap-2">
                    <Input
                        id="cf-token"
                        type={showToken ? 'text' : 'password'}
                        placeholder="Your API token with Workers Scripts: Edit permission"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                        className="flex-1"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowToken(!showToken)}
                        type="button"
                    >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Create at{' '}
                    <a
                        href="https://dash.cloudflare.com/profile/api-tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        dash.cloudflare.com/profile/api-tokens
                    </a>
                    {' '}→ Custom Token → Workers Scripts: Edit + Account Settings: Read
                </p>
            </div>

            {/* Worker name + Account ID */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="cf-worker-name">Worker Name</Label>
                    <Input
                        id="cf-worker-name"
                        placeholder="frontbase-edge"
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cf-account-id">
                        Account ID <span className="text-muted-foreground text-xs">(auto-detected)</span>
                    </Label>
                    <Input
                        id="cf-account-id"
                        placeholder="Auto-detected from token"
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                    />
                </div>
            </div>

            {/* Optional Secrets Section */}
            <div className="space-y-2">
                <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    onClick={() => setShowSecrets(!showSecrets)}
                >
                    <Info className="h-3 w-3" />
                    {showSecrets ? 'Hide' : 'Show'} Worker Secrets (optional — auto-populated from settings)
                </button>

                {showSecrets && (
                    <div className="p-4 rounded-lg border border-dashed space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Leave empty to use your existing Turso & Redis settings automatically.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Turso DB URL</Label>
                                <Input
                                    type="password"
                                    placeholder="libsql://..."
                                    value={tursoUrl}
                                    onChange={(e) => setTursoUrl(e.target.value)}
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Turso Token</Label>
                                <Input
                                    type="password"
                                    placeholder="Token"
                                    value={tursoToken}
                                    onChange={(e) => setTursoToken(e.target.value)}
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Upstash URL</Label>
                                <Input
                                    type="password"
                                    placeholder="https://..."
                                    value={upstashUrl}
                                    onChange={(e) => setUpstashUrl(e.target.value)}
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Upstash Token</Label>
                                <Input
                                    type="password"
                                    placeholder="Token"
                                    value={upstashToken}
                                    onChange={(e) => setUpstashToken(e.target.value)}
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
                <Button
                    onClick={handleDeploy}
                    disabled={!apiToken || status === 'deploying' || status === 'tearing-down'}
                    className="min-w-[180px]"
                >
                    {status === 'deploying' ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Deploying...
                        </>
                    ) : status === 'deployed' ? (
                        <>
                            <Rocket className="mr-2 h-4 w-4" />
                            Re-deploy
                        </>
                    ) : (
                        <>
                            <Rocket className="mr-2 h-4 w-4" />
                            Deploy to Cloudflare
                        </>
                    )}
                </Button>

                {status === 'deployed' && (
                    <Button
                        variant="destructive"
                        onClick={handleTeardown}
                        disabled={status === 'tearing-down'}
                    >
                        {status === 'tearing-down' ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Removing...
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Teardown
                            </>
                        )}
                    </Button>
                )}

                {deployedUrl && (
                    <Button variant="ghost" size="sm" asChild>
                        <a href={`${deployedUrl}/api/health`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Health Check
                        </a>
                    </Button>
                )}
            </div>

            {/* Deploy result details */}
            {deployResult?.secrets_set?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    Secrets configured: {deployResult.secrets_set.join(', ')}
                </p>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cloud className="h-5 w-5" />
                        Deploy to Cloudflare Workers
                    </CardTitle>
                    <CardDescription>
                        One-click deploy your Edge Engine to Cloudflare Workers. Pages are
                        automatically pushed when published.
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
