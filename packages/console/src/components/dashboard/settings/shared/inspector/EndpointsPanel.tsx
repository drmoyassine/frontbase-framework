/**
 * EndpointsPanel — Dynamic endpoint catalog from live OpenAPI spec.
 *
 * Parses endpoints directly from the engine's OpenAPI spec (fetched at runtime).
 * Falls back to a "no spec available" message if the engine doesn't serve one.
 */

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { Zap, ExternalLink, AlertTriangle } from 'lucide-react';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import { getWorkerBaseUrl } from './types';

interface EndpointsPanelProps {
    engine: EdgeEngine;
    openApiSpec: any;
}

interface ParsedEndpoint {
    method: string;
    path: string;
    summary: string;
    description?: string;
    parameters?: any[];
    requestBody?: any;
    responses?: Record<string, any>;
    tags?: string[];
}

const METHOD_COLORS: Record<string, string> = {
    GET: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    POST: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    PUT: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    DELETE: 'text-red-500 bg-red-500/10 border-red-500/20',
    PATCH: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
};

const METHOD_ORDER: Record<string, number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

function parseEndpointsFromSpec(spec: any): ParsedEndpoint[] {
    if (!spec?.paths) return [];
    const endpoints: ParsedEndpoint[] = [];
    for (const [path, methods] of Object.entries(spec.paths as Record<string, any>)) {
        for (const [method, details] of Object.entries(methods)) {
            const upper = method.toUpperCase();
            if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(upper)) continue;
            const d = details as any;
            endpoints.push({
                method: upper,
                path,
                summary: d.summary || d.operationId || '',
                description: d.description,
                parameters: d.parameters,
                requestBody: d.requestBody,
                responses: d.responses,
                tags: d.tags,
            });
        }
    }
    // Sort: by path, then by method order
    endpoints.sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        return (METHOD_ORDER[a.method] ?? 5) - (METHOD_ORDER[b.method] ?? 5);
    });
    return endpoints;
}

export const EndpointsPanel: React.FC<EndpointsPanelProps> = ({ engine, openApiSpec }) => {
    const workerBaseUrl = getWorkerBaseUrl(engine);
    const endpoints = useMemo(() => parseEndpointsFromSpec(openApiSpec), [openApiSpec]);

    // No spec available — fallback message
    if (!openApiSpec || endpoints.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3 max-w-sm">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-sm text-muted-foreground">No endpoint spec available</p>
                    <p className="text-xs text-muted-foreground">
                        This engine doesn't serve an OpenAPI spec at <code className="bg-muted px-1 rounded">/api/openapi.json</code>.
                        {workerBaseUrl && (
                            <> Try <a href={`${workerBaseUrl}/api/openapi.json`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">opening it directly</a>.</>
                        )}
                    </p>
                </div>
            </div>
        );
    }

    // Extract title/version from spec info
    const specTitle = openApiSpec?.info?.title || 'API';
    const specVersion = openApiSpec?.info?.version || '';

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Endpoints ({endpoints.length})</span>
                    {specVersion && (
                        <Badge variant="outline" className="text-[10px]">{specVersion}</Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{specTitle}</Badge>
                    {workerBaseUrl && (
                        <a
                            href={`${workerBaseUrl}/api/docs`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                            Swagger UI <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                    )}
                </div>
            </div>
            <ScrollArea className="flex-1">
                <Accordion type="multiple" className="px-4 py-2">
                    {endpoints.map((ep, i) => {
                        const fullUrl = workerBaseUrl ? `${workerBaseUrl}${ep.path}` : null;
                        const isClickable = ep.method === 'GET' && fullUrl && !ep.path.includes('{') && !ep.path.includes(':');
                        const isDynamic = ep.path.includes('{') || ep.path.includes(':');
                        return (
                            <AccordionItem key={i} value={`ep-${i}`} className="border-b-0 mb-1">
                                <AccordionTrigger className="py-2 px-2.5 rounded-lg border bg-card hover:bg-accent/50 hover:no-underline [&[data-state=open]]:rounded-b-none">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${METHOD_COLORS[ep.method] || ''}`}>
                                            {ep.method}
                                        </span>
                                        {isClickable ? (
                                            <a
                                                href={fullUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-mono font-medium text-primary hover:underline flex items-center gap-1"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {ep.path}
                                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                                            </a>
                                        ) : (
                                            <span className="text-sm font-mono font-medium">{ep.path}</span>
                                        )}
                                        {isDynamic && <Badge variant="secondary" className="text-[10px] h-4">dynamic</Badge>}
                                        <span className="text-[10px] text-muted-foreground ml-auto mr-2 hidden sm:inline">{ep.summary}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-2.5 pb-2.5 border border-t-0 rounded-b-lg bg-card">
                                    <div className="space-y-3 pt-2">
                                        <p className="text-xs text-muted-foreground">{ep.description || ep.summary}</p>
                                        {fullUrl && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground">URL:</span>
                                                <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded break-all">{fullUrl}</code>
                                            </div>
                                        )}
                                        {ep.requestBody && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Request Body</div>
                                                <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-x-auto max-h-32">
                                                    {JSON.stringify(
                                                        ep.requestBody?.content?.['application/json']?.schema || ep.requestBody,
                                                        null, 2
                                                    )}
                                                </pre>
                                            </div>
                                        )}
                                        {ep.parameters && ep.parameters.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Parameters</div>
                                                <div className="space-y-1">
                                                    {ep.parameters.map((p: any, j: number) => (
                                                        <div key={j} className="flex items-center gap-2 text-[10px]">
                                                            <Badge variant="outline" className="text-[9px] h-4">{p.in}</Badge>
                                                            <code className="font-mono">{p.name}</code>
                                                            {p.required && <span className="text-red-400">*</span>}
                                                            <span className="text-muted-foreground">{p.schema?.type || ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {ep.responses && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Responses</div>
                                                <div className="space-y-1">
                                                    {Object.entries(ep.responses).map(([code, resp]: [string, any]) => (
                                                        <div key={code} className="flex items-start gap-2 text-[10px]">
                                                            <Badge variant={code.startsWith('2') ? 'default' : 'destructive'} className="text-[9px] h-4 shrink-0">{code}</Badge>
                                                            <span className="text-muted-foreground">{resp.description || ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </ScrollArea>
        </div>
    );
};
