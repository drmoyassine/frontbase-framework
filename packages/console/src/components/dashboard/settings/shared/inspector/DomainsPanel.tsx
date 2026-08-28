/**
 * DomainsPanel — Custom domain management for Edge Engines.
 *
 * Right-side panel in Edge Inspector for listing, adding, verifying,
 * and deleting custom domains. Works across all providers that support
 * domain management (CF, Vercel, Netlify, Deno).
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Globe, Plus, Trash2, RefreshCw, Loader2, CheckCircle2,
    AlertCircle, Clock, Copy, Check, ExternalLink, Info,
} from 'lucide-react';
import type { DomainInfo, InspectDomainsResponse } from './types';
import { API_BASE } from './types';

interface DomainsPanelProps {
    engineId: string;
    domainsData: InspectDomainsResponse | undefined;
    loadingDomains: boolean;
    providerLabel: string;
    providerType?: string;   // e.g. 'supabase', 'cloudflare', 'deno'
    engineUrl?: string;  // e.g. "https://frontbase-edgenew.drmoyassine.deno.net"
}

// ─── Status badge helper ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'active':
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-600/30 bg-emerald-500/10">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Active
                </Badge>
            );
        case 'pending':
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-600/30 bg-amber-500/10">
                    <Clock className="h-2.5 w-2.5" /> Pending
                </Badge>
            );
        default:
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-600/30 bg-red-500/10">
                    <AlertCircle className="h-2.5 w-2.5" /> {status}
                </Badge>
            );
    }
}

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

// ─── Component ──────────────────────────────────────────────────────────────

export const DomainsPanel: React.FC<DomainsPanelProps> = ({
    engineId, domainsData, loadingDomains, providerLabel, providerType, engineUrl,
}) => {
    const queryClient = useQueryClient();
    const [newDomain, setNewDomain] = useState('');
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // Deno: track pending domain locally (backend doesn't persist until health-check passes)
    const [denoPendingDomain, setDenoPendingDomain] = useState<string | null>(null);
    const isDeno = providerLabel?.toLowerCase().includes('deno');
    const isSupabase = providerType === 'supabase';
    // Supabase: track pending domain locally (same ephemeral pattern as Deno)
    const [supabasePendingDomain, setSupabasePendingDomain] = useState<string | null>(null);

    // Extract Supabase hostname + function path from engine URL
    const supaInfo = React.useMemo(() => {
        if (!isSupabase || !engineUrl) return { hostname: '', funcPath: '', funcSlug: '' };
        try {
            const u = new URL(engineUrl);
            const pathname = u.pathname.replace(/\/$/, '');
            const slug = pathname.split('/').pop() || '';
            return { hostname: u.hostname, funcPath: pathname, funcSlug: slug };
        } catch { return { hostname: '', funcPath: '', funcSlug: '' }; }
    }, [isSupabase, engineUrl]);

    const invalidateDomains = () => {
        queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'domains', engineId] });
        // Also invalidate engine data so Endpoint URL refreshes after custom domain changes
        queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
        queryClient.invalidateQueries({ queryKey: ['edge-inspector'] });
    };

    // Build console.deno.com link from engine URL
    const denoConsoleUrl = React.useMemo(() => {
        if (!isDeno || !engineUrl) return 'https://console.deno.com';
        try {
            const host = new URL(engineUrl).hostname;
            const parts = host.split('.');
            if (parts.length >= 4) return `https://console.deno.com/${parts[1]}/${parts[0]}/settings`;
        } catch { /* fallback */ }
        return 'https://console.deno.com';
    }, [isDeno, engineUrl]);

    // ── Add domain mutation ─────────────────────────────────────────────
    const addMutation = useMutation({
        mutationFn: async (domain: string) => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            return resp.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                setNewDomain('');
                if (isDeno) {
                    // Deno: ephemeral — track pending domain locally
                    setDenoPendingDomain(data.domain?.domain || newDomain);
                    setStatusMsg({ type: 'success', text: data.detail || 'Configure this domain on the Deno console, then click Test.' });
                } else if (isSupabase) {
                    // Supabase: ephemeral — track pending domain locally
                    setSupabasePendingDomain(data.domain?.domain || newDomain);
                    setStatusMsg({ type: 'success', text: data.detail || 'Configure Cloudflare DNS and Transform Rules, then click Verify.' });
                } else {
                    invalidateDomains();
                    setStatusMsg({ type: 'success', text: `Domain added successfully` });
                }
                setTimeout(() => setStatusMsg(null), 5000);
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Failed to add domain' });
            }
        },
        onError: (err: Error) => {
            setStatusMsg({ type: 'error', text: err.message });
        },
    });

    // ── Delete domain mutation ──────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: async (domainId: string) => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains/${domainId}`, {
                method: 'DELETE',
            });
            return resp.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                if (isDeno) setDenoPendingDomain(null);
                if (isSupabase) setSupabasePendingDomain(null);
                invalidateDomains();
                setStatusMsg({ type: 'success', text: 'Domain removed' });
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Failed to remove domain' });
            }
        },
    });

    // ── Verify domain mutation ──────────────────────────────────────────
    const [verifyingId, setVerifyingId] = useState<string | null>(null);
    const verifyMutation = useMutation({
        mutationFn: async (domainId: string) => {
            setVerifyingId(domainId);
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains/${domainId}/verify`, {
                method: 'POST',
            });
            return resp.json();
        },
        onSuccess: (data) => {
            setVerifyingId(null);
            if (data.success) {
                if (isDeno && data.domain?.status === 'active') {
                    setDenoPendingDomain(null);
                }
                if (isSupabase && data.domain?.status === 'active') {
                    setSupabasePendingDomain(null);
                }
                invalidateDomains();
                const msg = data.detail || (data.domain?.status === 'active' ? 'Domain verified!' : 'DNS not yet propagated — try again shortly');
                setStatusMsg({ type: 'success', text: msg });
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Verification failed' });
            }
            setTimeout(() => setStatusMsg(null), 5000);
        },
        onError: (err: Error) => {
            setVerifyingId(null);
            setStatusMsg({ type: 'error', text: `Verify request failed: ${err.message}` });
            setTimeout(() => setStatusMsg(null), 5000);
        },
    });

    // ── Not supported state ─────────────────────────────────────────────
    if (domainsData && !domainsData.success) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-3 max-w-sm">
                    <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm font-medium text-muted-foreground">Domains Not Available</p>
                    <p className="text-xs text-muted-foreground">{domainsData.detail}</p>
                </div>
            </div>
        );
    }

    const domains = domainsData?.domains ?? [];
    // For Deno, merge in the local pending domain if not already in server list
    const allDomains = React.useMemo(() => {
        let result = domains;
        // Deno: merge pending
        if (isDeno && denoPendingDomain) {
            const alreadySaved = result.some((d: DomainInfo) => d.domain === denoPendingDomain);
            if (!alreadySaved) result = [{ id: denoPendingDomain, domain: denoPendingDomain, status: 'pending', provider: 'deno' } as DomainInfo, ...result];
        }
        // Supabase: merge pending
        if (isSupabase && supabasePendingDomain) {
            const alreadySaved = result.some((d: DomainInfo) => d.domain === supabasePendingDomain);
            if (!alreadySaved) result = [{ id: supabasePendingDomain, domain: supabasePendingDomain, status: 'pending', provider: 'supabase' } as DomainInfo, ...result];
        }
        return result;
    }, [domains, denoPendingDomain, supabasePendingDomain, isDeno, isSupabase]);
    // Auto-clear pending if server already has it
    React.useEffect(() => {
        if (isDeno && denoPendingDomain && domains.some((d: DomainInfo) => d.domain === denoPendingDomain)) {
            setDenoPendingDomain(null);
        }
        if (isSupabase && supabasePendingDomain && domains.some((d: DomainInfo) => d.domain === supabasePendingDomain)) {
            setSupabasePendingDomain(null);
        }
    }, [domains, denoPendingDomain, supabasePendingDomain, isDeno, isSupabase]);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Custom Domains</span>
                        <Badge variant="secondary" className="text-[10px]">{providerLabel}</Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={invalidateDomains}
                        title="Refresh"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Status message */}
                {statusMsg && (
                    <div className={`mt-2 text-xs flex items-center gap-1.5 ${statusMsg.type === 'success' ? 'text-emerald-600' : 'text-destructive'}`}>
                        {statusMsg.type === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        {statusMsg.text}
                    </div>
                )}
            </div>



            {/* Add domain form — hidden when a custom domain already exists (1 per engine) */}
            {allDomains.length === 0 && (
            <div className="px-4 py-3 border-b border-border shrink-0">
                {/* Supabase: small explainer above the input */}
                {isSupabase && (
                    <div className="mb-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
                        <div className="flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-muted-foreground">
                                Supabase rewrites <code className="text-[9px] bg-muted px-0.5 rounded font-mono">Content-Type: text/html</code> → <code className="text-[9px] bg-muted px-0.5 rounded font-mono">text/plain</code>. A CF Worker proxy with a custom domain fixes SSR rendering.
                            </p>
                        </div>
                    </div>
                )}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (newDomain.trim()) addMutation.mutate(newDomain.trim());
                    }}
                    className="flex gap-2"
                >
                    <Input
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        placeholder="app.example.com"
                        className="h-8 text-xs flex-1"
                        disabled={addMutation.isPending}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        disabled={!newDomain.trim() || addMutation.isPending || (isDeno && !!denoPendingDomain) || (isSupabase && !!supabasePendingDomain)}
                    >
                        {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add
                    </Button>
                </form>
            </div>
            )}

            {/* Domain list */}
            <ScrollArea className="flex-1">
                {loadingDomains ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : allDomains.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center space-y-2">
                            <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                            <p className="text-xs text-muted-foreground">No custom domains configured</p>
                            <p className="text-[10px] text-muted-foreground/70">{isDeno ? 'Enter your custom domain above' : 'Add a domain above to get started'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {allDomains.map((d: DomainInfo) => (
                            <div key={d.id} className="px-4 py-3 hover:bg-accent/50 transition-colors">
                                {/* Domain name + status */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-medium">{d.domain}</span>
                                        <StatusBadge status={d.status} />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => deleteMutation.mutate(d.id)}
                                            disabled={deleteMutation.isPending}
                                            title="Remove domain"
                                        >
                                            {deleteMutation.isPending ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {/* Deno: Dashboard setup instructions (for pending domains) */}
                                {isDeno && d.status === 'pending' && (
                                    <div className="mt-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                                        <div className="flex items-start gap-2">
                                            <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <div className="space-y-1.5">
                                                <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                    Configure on Deno Dashboard
                                                </p>
                                                <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                                                    <li>Open your app's <strong>Settings</strong> on the Deno console</li>
                                                    <li>Under <strong>Production Domains</strong>, click <strong>Add domain</strong></li>
                                                    <li>Add <code className="text-[10px] bg-muted px-1 rounded font-mono">{d.domain}</code></li>
                                                    <li>Configure DNS records and verify on the Deno dashboard</li>
                                                </ol>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <a
                                                        href={denoConsoleUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                                                    >
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                        Open Deno Console
                                                    </a>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 text-[10px] gap-1 px-2"
                                                        onClick={() => verifyMutation.mutate(d.domain)}
                                                        disabled={verifyingId === d.domain}
                                                    >
                                                        {verifyingId === d.domain ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        )}
                                                        Test Connection
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Supabase: CF Worker setup instructions (pending) */}
                                {isSupabase && d.status === 'pending' && (() => {
                                    // Auto-generate CF Worker script with correct values
                                    const workerScript = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "${supaInfo.hostname}";
    url.pathname = "${supaInfo.funcPath}" + url.pathname;

    const resp = await fetch(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const headers = new Headers(resp.headers);

    // Restore Content-Type from X-Content-Type (Supabase strips it)
    const xct = headers.get("x-content-type");
    if (xct) headers.set("Content-Type", xct);

    // Remove Supabase's restrictive CSP that blocks inline styles/scripts
    headers.delete("content-security-policy");
    headers.delete("x-content-type-options");

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  }
};`;
                                    return (
                                    <div className="mt-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                                        <div className="flex items-start gap-2">
                                            <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <div className="space-y-2 flex-1">
                                                <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                    Set up a Cloudflare Worker as reverse proxy
                                                </p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    A CF Worker is required because Supabase itself uses Cloudflare, blocking direct CNAME proxying (Error 1014).
                                                </p>

                                                {/* Step 1: Create Worker */}
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-medium text-foreground">1. Create a CF Worker</p>
                                                    <p className="text-[10px] text-muted-foreground ml-2">CF Dashboard → Workers & Pages → Create</p>
                                                    <p className="text-[10px] text-muted-foreground ml-2">Click <strong>"Start with Hello World!"</strong> → name it → click <strong>Deploy</strong></p>
                                                    <p className="text-[10px] text-muted-foreground ml-2">Then click <strong>"Edit Code"</strong> and replace everything with:</p>
                                                    <div className="ml-2 relative">
                                                        <pre className="text-[9px] font-mono bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre">{workerScript}</pre>
                                                        <div className="absolute top-1 right-1">
                                                            <CopyButton text={workerScript} />
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground ml-2">Click <strong>Deploy</strong> to save.</p>
                                                </div>

                                                {/* Step 2: Add Custom Domain */}
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-medium text-foreground">2. Add Custom Domain to the Worker</p>
                                                    <p className="text-[10px] text-muted-foreground ml-2">Worker Settings → Domains & Routes → Add → Custom Domain</p>
                                                    <div className="ml-2 flex items-center gap-1.5">
                                                        <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                                            {d.domain}
                                                        </code>
                                                        <CopyButton text={d.domain} />
                                                    </div>
                                                    <p className="text-[9px] text-muted-foreground/70 ml-2">CF automatically creates the DNS record and provisions SSL.</p>
                                                </div>

                                                {/* Step 3: Verify */}
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-medium text-foreground">3. Click Verify below</p>
                                                    <p className="text-[10px] text-muted-foreground ml-2">We'll check if your domain resolves and update the engine URL.</p>
                                                </div>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[11px] gap-1.5 mt-1 w-full"
                                                    onClick={() => verifyMutation.mutate(d.id)}
                                                    disabled={verifyingId === d.id}
                                                >
                                                    {verifyingId === d.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    )}
                                                    Verify Domain
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })()}

                                {/* Supabase: Active domain confirmation */}
                                {isSupabase && d.status === 'active' && (
                                    <div className="mt-1.5 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Custom domain active — used as Endpoint URL
                                        </div>
                                    </div>
                                )}

                                {/* Non-Deno/non-Supabase: Step-by-step DNS setup (pending) or success (active) */}
                                {!isDeno && !isSupabase && d.status !== 'active' && (
                                    <div className="mt-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                                        <div className="flex items-start gap-2">
                                            <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <div className="space-y-1.5 flex-1">
                                                {d.provider === 'cloudflare' && d.domain.startsWith('*.') ? (
                                                    <>
                                                        <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                            Configure wildcard routing
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Cloudflare created the DNS record automatically. You must also add a <strong>Workers Route</strong> to wire traffic to the Worker.
                                                        </p>
                                                        <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                                                            <li>
                                                                Go to the Worker's <strong>Settings → Domains & Routes</strong>
                                                            </li>
                                                            <li>
                                                                Click <strong>+ Add</strong> → select <strong>Route</strong>
                                                            </li>
                                                            <li>
                                                                <div className="mt-0.5 ml-1 space-y-0.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-muted-foreground">Zone:</span>
                                                                        <code className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">{d.domain.slice(2)}</code>
                                                                        <CopyButton text={d.domain.slice(2)} />
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-muted-foreground">Route:</span>
                                                                        <code className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">{d.domain}/*</code>
                                                                        <CopyButton text={`${d.domain}/*`} />
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        </ol>
                                                        <p className="text-[10px] text-muted-foreground mt-1">
                                                            After saving the route, click <strong>Verify DNS</strong> below.
                                                        </p>
                                                    </>
                                                ) : d.provider === 'cloudflare' ? (
                                                    <>
                                                        <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                            Verify domain to activate
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            DNS is automatically configured by Cloudflare Workers. Click verify to confirm your domain is resolving.
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                            Configure DNS to activate
                                                        </p>
                                                        <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                                                            <li>
                                                                Go to your DNS provider and add a record:
                                                                {d.dns_records && d.dns_records.length > 0 ? (
                                                                    <div className="mt-1 ml-3 space-y-0.5">
                                                                        {d.dns_records.map((rec, ri) => (
                                                                            <div key={ri} className="flex items-center gap-1.5">
                                                                                <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                                                                    {rec.type} {rec.name} → {rec.content}
                                                                                </code>
                                                                                <CopyButton text={rec.content} />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : d.dns_target ? (
                                                                    <div className="mt-1 ml-3 flex items-center gap-1.5">
                                                                        <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                                                            CNAME → {d.dns_target}
                                                                        </code>
                                                                        <CopyButton text={d.dns_target} />
                                                                    </div>
                                                                ) : null}
                                                            </li>
                                                            <li>Wait a few minutes for DNS propagation</li>
                                                        </ol>
                                                        <p className="text-[10px] text-amber-600 mt-1">⚠ DNS-only (do not proxy) — required for SSL verification</p>
                                                    </>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[11px] gap-1.5 mt-2 w-full"
                                                    onClick={() => verifyMutation.mutate(d.id)}
                                                    disabled={verifyingId === d.id}
                                                >
                                                    {verifyingId === d.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    )}
                                                    Verify DNS
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Non-Deno/non-Supabase: Active / verified confirmation */}
                                {!isDeno && !isSupabase && d.status === 'active' && (
                                    <div className="mt-1.5 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Custom domain active — used as Endpoint URL
                                        </div>
                                    </div>
                                )}

                                {/* Deno: Active domain confirmation */}
                                {isDeno && d.status === 'active' && (
                                    <div className="mt-1.5 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Custom domain active — used as Endpoint URL
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
