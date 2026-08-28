/**
 * Renders the tenant's current plan usage, limits, and an upgrade/downgrade UI.
 * Integrates with Stripe Checkout for paid plans or automatically provisions free/default plans.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Check, X, Bot, ExternalLink } from 'lucide-react';
import { tenantPlanApi } from '@/services/tenantPlanApi';
import { billingApi } from '@/services/billingApi';
import { STALE } from '@/lib/queryCache';
import type { Plan } from '@/services/adminPlansApi';
import { isCloud } from '@/lib/edition';
import { agentApi } from '@/services/agentApi';
import { toast } from 'sonner';

const UNLIMITED = -1;

function fmtLimit(v: number | boolean): string {
    if (typeof v === 'boolean') return v ? 'Included' : 'Not included';
    return v === UNLIMITED ? 'Unlimited' : v.toLocaleString();
}

export const PlanUsageSection: React.FC = () => {
    const queryClient = useQueryClient();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});

    const handleAddonChange = (type: string, delta: number) => {
        setSelectedAddons(prev => {
            const current = prev[type] || 0;
            const next = Math.max(0, current + delta);
            if (next === 0) {
                const copy = { ...prev };
                delete copy[type];
                return copy;
            }
            return { ...prev, [type]: next };
        });
    };

    const { data, isLoading } = useQuery({
        queryKey: ['my-plan'],
        queryFn: () => tenantPlanApi.getMyPlan(),
        staleTime: STALE.DEFAULT,
        retry: 1,
        refetchOnWindowFocus: false,
    });
    const { data: addonsData } = useQuery({
        queryKey: ['my-addons'],
        queryFn: () => tenantPlanApi.getMyAddons(),
        staleTime: 60_000, // custom TTL (not a STALE tier)
        retry: 1,
        refetchOnWindowFocus: false,
    });
    const { data: publicData } = useQuery({
        queryKey: ['public-plans'],
        queryFn: () => tenantPlanApi.listPublicPlans(),
        enabled: pickerOpen,
        staleTime: 60_000, // custom TTL (not a STALE tier)
        retry: 1,
        refetchOnWindowFocus: false,
    });

    const checkoutMutation = useMutation({
        mutationFn: (slug: string) => {
            const addonsPayload = Object.entries(selectedAddons).map(([type, qty]) => ({ addon_type: type, quantity: qty }));
            return billingApi.createCheckoutSession(slug, addonsPayload.length > 0 ? addonsPayload : undefined);
        },
        onSuccess: (data) => {
            window.location.href = data.url;
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to initiate checkout'),
    });

    const portalMutation = useMutation({
        mutationFn: () => billingApi.createPortalSession(),
        onSuccess: (data) => {
            window.location.href = data.url;
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to open billing portal'),
    });

    if (isLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }
    if (!data?.plan) {
        return <p className="text-sm text-muted-foreground">No plan is associated with this workspace.</p>;
    }

    const { plan, limits, usage, pending_request } = data;
    const detailed = publicData?.detailed ?? [];

    return (
        <div className="space-y-6">
            {/* Current plan */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                {plan.name}
                                {plan.highlighted && plan.badge && (
                                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary uppercase">{plan.badge}</span>
                                )}
                            </CardTitle>
                            <CardDescription>{plan.description || 'Your current subscription plan.'}</CardDescription>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold">{plan.price_display}<span className="text-sm font-normal text-muted-foreground">{plan.price_period}</span></p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Limits vs usage */}
                    <div className="space-y-3">
                        {Object.entries(limits).filter(([key, value]) => {
                            // Show feature flags + any limit we track usage for; hide dormant
                            // (disabled/unlimited) operational caps that have no usage counter.
                            if (typeof value !== 'number') return true;
                            if (usage[key] != null) return true;
                            return value !== UNLIMITED;
                        }).map(([key, value]) => {
                            const used = usage[key];
                            const isNum = typeof value === 'number';
                            const pct = isNum && value !== UNLIMITED && (value as number) > 0 && used != null
                                ? Math.min(100, (used / (value as number)) * 100) : null;
                            return (
                                <div key={key} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                                        <span className="font-medium">
                                            {used != null && isNum ? `${used.toLocaleString()} / ` : ''}{fmtLimit(value)}
                                        </span>
                                    </div>
                                    {pct != null && <Progress value={pct} className="h-1.5" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-2 flex gap-3">
                        <Button onClick={() => setPickerOpen(true)} variant="outline">Change plan</Button>
                        <Button 
                            onClick={() => portalMutation.mutate()} 
                            disabled={portalMutation.isPending}
                        >
                            {portalMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Manage Billing <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Workspace Agent credits (cloud only) */}
            {isCloud() && <AgentCreditsCard />}

            {/* Managed add-ons (managed tiers) */}
            {data?.plan?.infra_mode === 'managed' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Managed add-ons</CardTitle>
                        <CardDescription>
                            Frontbase-managed infrastructure included with your plan. Add-ons are granted by your account manager.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const addons = addonsData?.addons ?? {};
                            const entries = Object.entries(addons);
                            if (entries.length === 0) {
                                return <p className="text-sm text-muted-foreground">No managed add-ons active.</p>;
                            }
                            return (
                                <ul className="text-sm space-y-1">
                                    {entries.map(([type, qty]) => (
                                        <li key={type} className="flex justify-between">
                                            <span className="capitalize text-muted-foreground">{type.replace(/^managed_/, '').replace(/_/g, ' ')}</span>
                                            <span className="font-medium">×{qty}</span>
                                        </li>
                                    ))}
                                </ul>
                            );
                        })()}
                    </CardContent>
                </Card>
            )}

            {/* Plan picker */}
            {pickerOpen && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Choose a plan</CardTitle>
                            <CardDescription>Select a base plan and optional managed add-ons</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}><X className="w-4 h-4" /></Button>
                    </CardHeader>
                    <CardContent>
                        {!publicData ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {detailed.map((p: Plan) => {
                                    const current = p.slug === plan.slug;
                                    const upgrade = p.sort_order > plan.sort_order;
                                    return (
                                        <div key={p.id} className={`rounded-xl border p-4 flex flex-col gap-2 ${current ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold">{p.name}</h4>
                                                {current && <span className="text-[10px] font-semibold uppercase text-primary">Current</span>}
                                            </div>
                                            <p className="text-xl font-bold">{p.price_display}<span className="text-xs font-normal text-muted-foreground">{p.price_period}</span></p>
                                            <ul className="text-xs text-muted-foreground space-y-1 flex-1">
                                                {p.features.slice(0, 5).map((f, i) => (
                                                    <li key={i} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary shrink-0" />{f}</li>
                                                ))}
                                            </ul>
                                            <Button size="sm" disabled={current || checkoutMutation.isPending}
                                                variant={upgrade ? 'default' : 'outline'}
                                                onClick={() => checkoutMutation.mutate(p.slug)}>
                                                {current ? 'Current plan' : (
                                                    <>{checkoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                        {upgrade ? 'Upgrade' : 'Downgrade'}</>
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        {publicData && (
                            <div className="mt-8 border-t pt-6">
                                <h4 className="font-semibold mb-4">Optional Add-ons</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {[
                                        { type: 'managed_edge_db', label: 'Managed Edge DB' },
                                        { type: 'managed_cache', label: 'Managed Cache' },
                                        { type: 'managed_queue', label: 'Managed Queue' },
                                        { type: 'managed_domain', label: 'Custom Domain' },
                                    ].map(addon => (
                                        <div key={addon.type} className="flex items-center justify-between p-3 border rounded-lg">
                                            <span className="text-sm font-medium">{addon.label}</span>
                                            <div className="flex items-center gap-2">
                                                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => handleAddonChange(addon.type, -1)} disabled={!selectedAddons[addon.type]}>-</Button>
                                                <span className="text-sm w-4 text-center">{selectedAddons[addon.type] || 0}</span>
                                                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => handleAddonChange(addon.type, 1)}>+</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {Object.keys(selectedAddons).length > 0 && (
                                    <p className="text-xs text-muted-foreground mt-4">
                                        Add-ons will be included in the checkout session.
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

/**
 * AgentCreditsCard — tenant-facing Workspace Agent credit balance.
 *
 * Cloud-only. Shows the daily + monthly credit pools with reset times. Support
 * conversations are free, which is called out at the bottom. Hidden for
 * self-host / master admin (the credits endpoint returns ``unlimited`` there).
 */
const AgentCreditsCard: React.FC = () => {
    const { data: credits, isLoading } = useQuery({
        queryKey: ['my-agent-credits'],
        queryFn: agentApi.getMyCredits,
        staleTime: STALE.DEFAULT,
    });

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-6 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }
    if (!credits || credits.unlimited) return null;

    const UNL = -1;
    const dailyLeft = credits.daily_remaining ?? 0;
    const monthlyLeft = credits.monthly_remaining ?? 0;
    const dailyLimit = credits.daily_limit ?? 0;
    const monthlyLimit = credits.monthly_limit ?? 0;
    const dailyUnlimited = dailyLeft === UNL || dailyLimit === UNL;
    const monthlyUnlimited = monthlyLeft === UNL || monthlyLimit === UNL;
    const dailyPct = dailyUnlimited || dailyLimit <= 0 ? null : Math.min(100, (dailyLeft / dailyLimit) * 100);
    const monthlyPct = monthlyUnlimited || monthlyLimit <= 0 ? null : Math.min(100, (monthlyLeft / monthlyLimit) * 100);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="w-4 h-4 text-primary" /> Workspace Agent credits
                </CardTitle>
                <CardDescription>Each Workspace Agent turn uses 1 credit. Resets daily (UTC) and monthly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Daily credits</span>
                        <span className="font-medium">{dailyUnlimited ? 'Unlimited' : `${dailyLeft} / ${dailyLimit}`}</span>
                    </div>
                    {dailyPct != null && <Progress value={dailyPct} className="h-1.5" />}
                    {credits.daily_resets_at && !dailyUnlimited && (
                        <p className="text-xs text-muted-foreground">Resets at {new Date(credits.daily_resets_at).toLocaleTimeString()}</p>
                    )}
                </div>

                {(monthlyLimit > 0 || monthlyUnlimited) && (
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Monthly credits</span>
                            <span className="font-medium">{monthlyUnlimited ? 'Unlimited' : `${monthlyLeft} / ${monthlyLimit}`}</span>
                        </div>
                        {monthlyPct != null && <Progress value={monthlyPct} className="h-1.5" />}
                        {credits.monthly_resets_at && !monthlyUnlimited && (
                            <p className="text-xs text-muted-foreground">Resets on {new Date(credits.monthly_resets_at).toLocaleDateString()}</p>
                        )}
                    </div>
                )}

                <p className="text-xs text-muted-foreground border-t pt-3">
                    Support &amp; onboarding conversations don&rsquo;t consume credits.
                </p>
            </CardContent>
        </Card>
    );
};

export default PlanUsageSection;
