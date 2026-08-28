/**
 * Pricing Properties Panel
 * Configuration UI for the Pricing component
 */

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/auth';
import { isCloud } from '@/lib/edition';

interface PricingPlan {
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    highlighted?: boolean;
    badge?: string;
}

interface PricingPropertiesProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const PricingProperties: React.FC<PricingPropertiesProps> = ({
    componentId,
    props,
    updateComponentProp
}) => {
    const { user, _realUser } = useAuthStore();
    const isMaster = user?.is_master || _realUser?.is_master;
    const showSourceToggle = isCloud() && isMaster;

    const [expandedPlanIndex, setExpandedPlanIndex] = useState<number | null>(0);

    const plans = (props.plans || []) as PricingPlan[];
    const source = props.source || 'manual';

    const handleUpdatePlan = (index: number, updates: Partial<PricingPlan>) => {
        const updatedPlans = plans.map((plan, idx) => 
            idx === index ? { ...plan, ...updates } : plan
        );
        updateComponentProp('plans', updatedPlans);
    };

    const handleAddPlan = () => {
        const newPlan: PricingPlan = {
            name: 'New Plan',
            price: '$19',
            period: '/month',
            description: 'A new pricing plan tier',
            features: ['Feature 1', 'Feature 2'],
            ctaText: 'Get Started',
            ctaLink: '#',
            highlighted: false
        };
        updateComponentProp('plans', [...plans, newPlan]);
        setExpandedPlanIndex(plans.length);
    };

    const handleRemovePlan = (index: number) => {
        const updatedPlans = plans.filter((_, idx) => idx !== index);
        updateComponentProp('plans', updatedPlans);
        if (expandedPlanIndex === index) {
            setExpandedPlanIndex(null);
        } else if (expandedPlanIndex !== null && expandedPlanIndex > index) {
            setExpandedPlanIndex(expandedPlanIndex - 1);
        }
    };

    const handleMovePlan = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= plans.length) return;

        const updatedPlans = [...plans];
        const [movedPlan] = updatedPlans.splice(index, 1);
        updatedPlans.splice(targetIndex, 0, movedPlan);

        updateComponentProp('plans', updatedPlans);
        setExpandedPlanIndex(targetIndex);
    };

    return (
        <div className="space-y-4">
            {/* Header Settings */}
            <div className="space-y-3 pb-4 border-b">
                <Label className="text-sm font-semibold">Header Configuration</Label>
                <div className="space-y-2">
                    <Label htmlFor="pricing-title" className="text-xs text-muted-foreground">Section Title</Label>
                    <Input
                        id="pricing-title"
                        value={props.title ?? ''}
                        onChange={(e) => updateComponentProp('title', e.target.value)}
                        placeholder="Simple, transparent pricing"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pricing-subtitle" className="text-xs text-muted-foreground">Subtitle</Label>
                    <Input
                        id="pricing-subtitle"
                        value={props.subtitle ?? ''}
                        onChange={(e) => updateComponentProp('subtitle', e.target.value)}
                        placeholder="No hidden fees. Cancel anytime."
                    />
                </div>
            </div>

            {/* Source Binding (Master Admin Only) */}
            {showSourceToggle && (
                <div className="space-y-3 py-4 border-b bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                    <Label className="text-sm font-semibold text-amber-600 dark:text-amber-400">Plans Catalog Source</Label>
                    <Select
                        value={source}
                        onValueChange={(val) => updateComponentProp('source', val)}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select plans source" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="manual">Manual Configuration (Standard)</SelectItem>
                            <SelectItem value="frontbase_plans">Frontbase Plans Catalog (Database Bound)</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {source === 'frontbase_plans' 
                            ? 'Database mode: Pricing table reads master plans from catalog. Manual editor is hidden.' 
                            : 'Standard mode: Configure pricing plans manually using the editor below.'
                        }
                    </p>
                </div>
            )}

            {/* Plans List Editor (Hidden if source is frontbase_plans) */}
            {source === 'manual' ? (
                <div className="space-y-4 py-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Pricing Plans</Label>
                        <Button variant="outline" size="sm" onClick={handleAddPlan}>
                            <Plus className="h-3 w-3 mr-1" /> Add Plan
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {plans.map((plan, index) => (
                            <div key={index} className="border rounded-md bg-muted/30">
                                {/* Plan Header */}
                                <div
                                    className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                                    onClick={() => setExpandedPlanIndex(expandedPlanIndex === index ? null : index)}
                                >
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-semibold text-xs flex-1 truncate">{plan.name || 'Untitled Plan'}</span>
                                    <span className="text-xs text-muted-foreground">{plan.price || 'Free'}</span>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            disabled={index === 0}
                                            onClick={(e) => { e.stopPropagation(); handleMovePlan(index, 'up'); }}
                                        >
                                            <ChevronUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            disabled={index === plans.length - 1}
                                            onClick={(e) => { e.stopPropagation(); handleMovePlan(index, 'down'); }}
                                        >
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-destructive"
                                            onClick={(e) => { e.stopPropagation(); handleRemovePlan(index); }}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Form Fields */}
                                {expandedPlanIndex === index && (
                                    <div className="p-3 border-t space-y-3 bg-card">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Plan Name</Label>
                                                <Input
                                                    value={plan.name}
                                                    onChange={(e) => handleUpdatePlan(index, { name: e.target.value })}
                                                    placeholder="Starter"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Badge (optional)</Label>
                                                <Input
                                                    value={plan.badge || ''}
                                                    onChange={(e) => handleUpdatePlan(index, { badge: e.target.value })}
                                                    placeholder="Most Popular"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Price Display</Label>
                                                <Input
                                                    value={plan.price}
                                                    onChange={(e) => handleUpdatePlan(index, { price: e.target.value })}
                                                    placeholder="$29"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Period (optional)</Label>
                                                <Input
                                                    value={plan.period || ''}
                                                    onChange={(e) => handleUpdatePlan(index, { period: e.target.value })}
                                                    placeholder="/month"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Description</Label>
                                            <Input
                                                value={plan.description || ''}
                                                onChange={(e) => handleUpdatePlan(index, { description: e.target.value })}
                                                placeholder="Perfect for growing teams"
                                                className="h-8 text-sm"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">CTA Button Text</Label>
                                                <Input
                                                    value={plan.ctaText}
                                                    onChange={(e) => handleUpdatePlan(index, { ctaText: e.target.value })}
                                                    placeholder="Start Trial"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">CTA Link</Label>
                                                <Input
                                                    value={plan.ctaLink}
                                                    onChange={(e) => handleUpdatePlan(index, { ctaLink: e.target.value })}
                                                    placeholder="#"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between py-1">
                                            <Label className="text-xs font-semibold">Highlight (Most Popular style)</Label>
                                            <Switch
                                                checked={!!plan.highlighted}
                                                onCheckedChange={(val) => handleUpdatePlan(index, { highlighted: val })}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Features (one per line)</Label>
                                            <Textarea
                                                value={(plan.features || []).join('\n')}
                                                onChange={(e) => handleUpdatePlan(index, { features: e.target.value.split('\n') })}
                                                placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                                                rows={4}
                                                className="text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {plans.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg bg-card">
                                No plans configured. Click "Add Plan" to create one.
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="p-4 bg-muted border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                    Pricing plans are managed dynamically under Master Admin Plans tools.
                </div>
            )}
        </div>
    );
};
