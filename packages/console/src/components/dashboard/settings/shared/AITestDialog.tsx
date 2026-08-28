import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Brain, Copy, Check, Zap, Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { API_BASE } from './edgeConstants';
import { toast } from 'sonner';
import { showTestToast } from './edgeTestToast';

interface GPUModelInfo {
    id: string;
    name: string;
    slug?: string;
    model_id?: string;
    model_type: string;
    endpoint_url?: string | null;
}

interface AITestDialogProps {
    gpuModels: GPUModelInfo[];
    trigger?: React.ReactNode;
}

import {
    type SchemaParam, type ModalityConfig,
    MODALITY_MAP, DEFAULT_MODALITY,
    CHAT_COMPLETIONS_PARAMS, RESPONSES_PARAMS,
    getContextSize, getModelCardUrl,
} from './aiTestSchemas';



// =============================================================================
// Component
// =============================================================================

export const AITestDialog: React.FC<AITestDialogProps> = ({ gpuModels, trigger }) => {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [testing, setTesting] = useState(false);
    const [schemaExpanded, setSchemaExpanded] = useState(false);
    // Track which optional params are included — keyed by param name
    const [includedParams, setIncludedParams] = useState<Set<string>>(new Set());

    // ── Model selector ───────────────────────────────────────────────
    const [selectedModelIdx, setSelectedModelIdx] = useState(0);
    const gpuModel = gpuModels[selectedModelIdx] || gpuModels[0];

    // Reset endpoint + params when model changes
    useEffect(() => {
        setSelectedEndpointIdx(0);
        setIncludedParams(new Set());
    }, [selectedModelIdx]);

    const normalizedType = gpuModel.model_type.toLowerCase().replace(/\s+/g, '-');
    const contextSize = getContextSize(gpuModel.model_id);
    const modelCardUrl = getModelCardUrl(gpuModel.model_id);

    // Available endpoints for this model type
    const availableEndpoints = useMemo(() => {
        const primary = MODALITY_MAP[normalizedType] || DEFAULT_MODALITY;
        const endpoints = [primary];
        // Text generation models also support the Responses API
        if (normalizedType === 'text-generation' || normalizedType === 'llm') {
            endpoints.push(MODALITY_MAP['responses']);
        }
        return endpoints.filter(Boolean);
    }, [normalizedType]);

    const [selectedEndpointIdx, setSelectedEndpointIdx] = useState(0);
    const activeModality = availableEndpoints[selectedEndpointIdx] || availableEndpoints[0];

    // Reset selected params when endpoint changes
    useEffect(() => {
        setIncludedParams(new Set());
    }, [selectedEndpointIdx]);

    const toggleParam = useCallback((paramName: string) => {
        setIncludedParams(prev => {
            const next = new Set(prev);
            if (next.has(paramName)) next.delete(paramName);
            else next.add(paramName);
            return next;
        });
    }, []);

    // Build cURL dynamically: base body + checked optional params
    const getCurlSnippet = useMemo(() => {
        let url = gpuModel.endpoint_url || `https://<engine-url>${activeModality.endpoint}`;
        // Strip any existing /v1/* or legacy /api/ai/* path to get the base origin
        const baseUrl = url.replace(/\/(v1|api\/ai)\/.*$/, '');
        url = `${baseUrl}${activeModality.endpoint}`;
        const modelName = gpuModel.slug || gpuModel.name.toLowerCase().replace(/\s+/g, '-');
        const body = { ...activeModality.baseBody(modelName) };

        // Inject checked optional params with their default values
        for (const param of activeModality.params) {
            if (!param.required && includedParams.has(param.name)) {
                const value = param.defaultRaw !== null ? param.defaultRaw : null;
                // Handle nested params like reasoning.effort
                if (param.name.includes('.')) {
                    const [parent, child] = param.name.split('.');
                    if (!body[parent]) body[parent] = {};
                    body[parent][child] = value;
                } else {
                    body[param.name] = value;
                }
            }
        }

        return `curl -X POST "${url}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
    }, [gpuModel, activeModality, includedParams]);

    const handleCopy = () => {
        navigator.clipboard.writeText(getCurlSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await fetch(`${API_BASE}/api/edge-gpu/${gpuModel.id}/test`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Test failed');
            showTestToast(
                { success: true, message: `Inference completed in ${data.latency_ms ?? '?'}ms` },
                gpuModel.name
            );
        } catch (err: any) {
            showTestToast(
                { success: false, message: err.message || 'Inference failed' },
                gpuModel.name
            );
        } finally {
            setTesting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" title="AI Endpoint Details">
                        <Brain className="h-4 w-4 text-purple-400" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-[720px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-500" />
                        AI Endpoint Details
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-4 overflow-hidden">
                    {/* Model Info — MODEL (dropdown if multiple), TYPE, CONTEXT, ENDPOINT */}
                    <div className="flex items-center gap-6 flex-wrap">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Model</p>
                            <div className="flex items-center gap-1.5">
                                {gpuModels.length > 1 ? (
                                    <select
                                        value={selectedModelIdx}
                                        onChange={(e) => setSelectedModelIdx(Number(e.target.value))}
                                        className="text-sm font-medium bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        {gpuModels.map((m, i) => (
                                            <option key={m.id} value={i}>{m.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className="text-sm font-medium">{gpuModel.name}</p>
                                )}
                                {modelCardUrl && (
                                    <a href={modelCardUrl} target="_blank" rel="noopener noreferrer" title="View model card">
                                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Type</p>
                            <p className="text-sm font-medium capitalize">{gpuModel.model_type}</p>
                        </div>
                        {contextSize && (
                            <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Context</p>
                                <p className="text-sm font-medium">{contextSize}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Endpoint</p>
                            {availableEndpoints.length > 1 ? (
                                <select
                                    value={selectedEndpointIdx}
                                    onChange={(e) => setSelectedEndpointIdx(Number(e.target.value))}
                                    className="text-sm font-medium bg-transparent border border-border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    {availableEndpoints.map((ep, i) => (
                                        <option key={ep.endpoint} value={i}>{ep.endpoint}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-sm font-medium">{activeModality.endpoint}</p>
                            )}
                        </div>
                    </div>

                    {/* Quick Start cURL — updates dynamically when params are toggled */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">Request</p>
                                {includedParams.size > 0 && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        +{includedParams.size} optional
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy cURL">
                                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleTest} disabled={testing || !gpuModel.endpoint_url} title="Test inference">
                                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        </div>
                        <pre className="bg-muted border p-3 rounded-md overflow-x-auto text-[11px] font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
                            <code>{getCurlSnippet}</code>
                        </pre>
                    </div>

                    {/* Collapsible Schema Reference with interactive checkboxes */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setSchemaExpanded(!schemaExpanded)}
                            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                        >
                            {schemaExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                            }
                            Full Schema Reference
                            <span className="text-xs text-muted-foreground/60 ml-1">
                                ({activeModality.params.filter(p => p.required).length} required, {activeModality.params.filter(p => !p.required).length} optional)
                            </span>
                        </button>

                        {schemaExpanded && (
                            <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-muted/50 border-b">
                                            <th className="px-2 py-1.5 w-8"></th>
                                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Parameter</th>
                                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Type</th>
                                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-14"></th>
                                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Default</th>
                                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeModality.params.map((param, i) => {
                                            const isChecked = param.required || includedParams.has(param.name);
                                            return (
                                                <tr
                                                    key={param.name}
                                                    className={`${i % 2 === 0 ? 'bg-card' : 'bg-muted/20'} ${!param.required ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}`}
                                                    onClick={!param.required ? () => toggleParam(param.name) : undefined}
                                                >
                                                    <td className="px-2 py-1.5 text-center">
                                                        <Checkbox
                                                            checked={isChecked}
                                                            disabled={param.required}
                                                            onCheckedChange={() => { if (!param.required) toggleParam(param.name); }}
                                                            className="h-3.5 w-3.5"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </td>
                                                    <td className={`px-3 py-1.5 font-mono ${isChecked ? 'text-foreground' : 'text-muted-foreground'}`}>{param.name}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground font-mono">{param.type}</td>
                                                    <td className="px-3 py-1.5">
                                                        {param.required ? (
                                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 leading-none">
                                                                required
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 leading-none">
                                                                optional
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-muted-foreground font-mono text-[10px]">{param.defaultVal}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{param.description}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
