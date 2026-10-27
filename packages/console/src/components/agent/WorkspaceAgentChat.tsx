import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Bot, X, Maximize2, Minimize2, Send, AlertTriangle, Loader2, Zap, MessageCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { isCloud } from '@/lib/edition';
import { agentApi, type MyAgentCredits } from '@/services/agentApi';
import { WorkspaceAgentSettingsModal } from './WorkspaceAgentSettingsModal';

// =============================================================================
// SSE Chat Hook — parses plain SSE events from the PydanticAI backend
// =============================================================================

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface SSEEvent {
    type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'quota_exceeded' | 'credit_balance_updated';
    content?: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
    [key: string]: unknown;
}

interface SSEHandlers {
    /** Called for every parsed SSE event (e.g. quota_exceeded / credit_balance_updated). */
    onEvent?: (event: SSEEvent) => void;
}

function useSSEChat(apiUrl: string, bodyPayload: Record<string, unknown>, handlers?: SSEHandlers) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    // Keep the latest handler without churning the append callback identity.
    const handlerRef = useRef(handlers?.onEvent);
    handlerRef.current = handlers?.onEvent;

    const append = useCallback(async (message: { role: string; content: string }) => {
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: message.content,
        };

        const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setIsLoading(true);

        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const allMessages = [...messages, userMsg].map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...bodyPayload, messages: allMessages }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => `Status ${response.status}`);
                throw new Error(errorText || `API responded with status: ${response.status}`);
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines: "data: {...}\n\n"
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const jsonStr = trimmed.slice(6); // Remove "data: " prefix
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const event: SSEEvent = JSON.parse(jsonStr);
                        // Surface every event to the component (quota / balance updates).
                        handlerRef.current?.(event);

                        if (event.type === 'text' && event.content) {
                            accumulatedContent += event.content;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                return next;
                            });
                        } else if (event.type === 'tool_call') {
                            // Show tool usage inline
                            accumulatedContent += `\n🔧 Using tool: ${event.name}...\n`;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                return next;
                            });
                        } else if (event.type === 'tool_result') {
                            // Acknowledge the tool returned (keeps the contract honored end-to-end;
                            // the assistant's follow-up text carries the actual answer)
                            accumulatedContent += `\n  ✓ ${event.name}\n`;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                return next;
                            });
                        } else if (event.type === 'quota_exceeded') {
                            // Rendered by the component via onEvent (banner). If blocked, no text
                            // follows; surface a short notice in the bubble for context.
                            if (event.blocked) {
                                accumulatedContent += `\n⛔ ${event.reason || 'Credit quota exhausted.'}\n`;
                                setMessages(prev => {
                                    const next = [...prev];
                                    const lastIdx = next.length - 1;
                                    next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                    return next;
                                });
                            }
                        } else if (event.type === 'done') {
                            break;
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return;

            console.error('[SSEChat Error]', error);

            // Show error in the assistant message
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            setMessages(prev => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (next[lastIdx]?.role === 'assistant' && !next[lastIdx].content) {
                    next[lastIdx] = { ...next[lastIdx], content: `⚠️ Error: ${errMsg}` };
                }
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    }, [apiUrl, bodyPayload, messages]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setMessages([]);
        setIsLoading(false);
    }, []);

    return { messages, append, isLoading, reset };
}

// =============================================================================
// Available Models (static list for UI selectors — self-host mode only)
// =============================================================================

const AVAILABLE_MODELS: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini', 'gpt-3.5-turbo'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
    ollama: ['llama3', 'mistral', 'qwen2.5-coder'],
    workers_ai: ['@cf/meta/llama-3.1-8b-instruct']
};

const UNLIMITED = -1;

// =============================================================================
// WorkspaceAgentChat Component
// =============================================================================

export const WorkspaceAgentChat: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    profileSlug?: string,
}> = ({ isOpen, onClose, profileSlug = 'workspace-agent' }) => {
    const cloud = isCloud();
    const [isExpanded, setIsExpanded] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [localInput, setLocalInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const [providerStatus, setProviderStatus] = useState<'checking' | 'ok' | 'missing'>('checking');

    // Provider / model selection (self-host mode only — cloud uses the shared provider).
    const [providers, setProviders] = useState<Array<{ id: string; name: string; provider: string }>>([]);
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [selectedModelId, setSelectedModelId] = useState<string>('');

    // Cloud-mode credit quota state.
    const [mode, setMode] = useState<'workspace' | 'support'>('workspace');
    const [credits, setCredits] = useState<MyAgentCredits | null>(null);
    const [quotaInfo, setQuotaInfo] = useState<{ resetsAt: string; pool: string; blocked: boolean } | null>(null);

    // Update available models when provider changes (self-host)
    const activeProvider = providers.find(p => p.id === selectedProviderId);
    const providerType = activeProvider?.provider || 'openai';
    const availableModels = AVAILABLE_MODELS[providerType] || ['default'];

    useEffect(() => {
        if (!isOpen) return;

        if (cloud) {
            // Cloud: the provider is shared (master-admin configured). Treat as ready and
            // load the tenant's credit balance. If no shared provider exists, the agent
            // stream surfaces an error event on first turn.
            setProviderStatus('ok');
            agentApi.getMyCredits().then(setCredits).catch(() => setCredits(null));
            return;
        }

        // Self-host: discover the tenant's own LLM providers.
        setProviderStatus('checking');
        fetch('/api/edge-providers/')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const llmProviders = data.filter(
                        (p: { provider: string; is_active: boolean }) =>
                            ['openai', 'anthropic', 'workers_ai', 'ollama', 'google'].includes(p.provider) && p.is_active
                    );

                    if (llmProviders.length > 0) {
                        setProviders(llmProviders);
                        setProviderStatus('ok');
                        const first = llmProviders[0];
                        setSelectedProviderId(first.id);
                        const pt = first.provider;
                        const models = AVAILABLE_MODELS[pt] || ['default'];
                        setSelectedModelId(models[0]);
                    } else {
                        setProviderStatus('missing');
                    }
                } else {
                    setProviderStatus('missing');
                }
            })
            .catch(() => setProviderStatus('ok'));
    }, [isOpen, cloud]);

    // Handle provider selection change (self-host)
    const onProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setSelectedProviderId(newId);

        const newProv = providers.find(p => p.id === newId);
        if (newProv) {
            const models = AVAILABLE_MODELS[newProv.provider] || ['default'];
            setSelectedModelId(models[0]);
        }
    };

    const agentUrl = '/api/agent/chat';
    const chatBody = useMemo(() => ({
        // Cloud ignores provider_id (shared provider); self-host uses the selection.
        provider_id: cloud ? undefined : selectedProviderId,
        model_id: cloud ? undefined : selectedModelId,
        use_type: mode, // 'workspace' (consumes credits) | 'support' (free)
    }), [selectedProviderId, selectedModelId, mode, cloud]);

    // SSE event routing for quota / balance events.
    const handleSSEEvent = useCallback((event: SSEEvent) => {
        if (event.type === 'quota_exceeded') {
            const resetsAt = (event.pool === 'daily' ? event.daily_resets_at : event.monthly_resets_at) as string;
            setQuotaInfo({ resetsAt: resetsAt || '', pool: String(event.pool || 'daily'), blocked: !!event.blocked });
            if (typeof event.daily_remaining === 'number' || typeof event.monthly_remaining === 'number') {
                setCredits(prev => prev ? {
                    ...prev,
                    daily_remaining: event.daily_remaining as number,
                    monthly_remaining: event.monthly_remaining as number,
                } : prev);
            }
        } else if (event.type === 'credit_balance_updated') {
            setCredits(prev => ({
                ...(prev || {}),
                daily_remaining: event.daily_remaining as number,
                monthly_remaining: event.monthly_remaining as number,
                daily_limit: event.daily_limit as number,
                monthly_limit: event.monthly_limit as number,
                daily_resets_at: event.daily_resets_at as string,
                monthly_resets_at: event.monthly_resets_at as string,
            }));
            // Clear the exhausted banner once credits are replenished.
            const dr = event.daily_remaining as number;
            const mr = event.monthly_remaining as number;
            if ((dr && dr > 0) || (mr && mr > 0) || dr === UNLIMITED || mr === UNLIMITED) {
                setQuotaInfo(null);
            }
        }
    }, []);

    const { messages, append, isLoading } = useSSEChat(agentUrl, chatBody, { onEvent: handleSSEEvent });

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Switching modes clears the exhausted banner (support is free / workspace may have credits).
    useEffect(() => { if (mode === 'support') setQuotaInfo(null); }, [mode]);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = localInput.trim();
        if (isLoading || providerStatus === 'missing' || !trimmed) {
            return;
        }

        append({ role: 'user', content: trimmed });
        setLocalInput('');
    };

    if (!isOpen) return null;

    const creditsActive = cloud && mode === 'workspace' && credits && !credits.unlimited;
    const dailyLeft = credits?.daily_remaining ?? 0;
    const monthlyLeft = credits?.monthly_remaining ?? 0;
    const dailyUnlimited = dailyLeft === UNLIMITED;
    const monthlyUnlimited = monthlyLeft === UNLIMITED;

    return (
        <div className={`fixed bottom-4 right-4 z-50 flex flex-col bg-background shadow-2xl border border-border rounded-lg transition-all overflow-hidden ${isExpanded ? 'w-[600px] h-[800px]' : 'w-[400px] h-[600px]'}`}>
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-primary/20 text-primary p-1.5 rounded-md shrink-0">
                        <Bot className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-sm truncate">Workspace Agent</span>

                    {/* Mode toggle (cloud only) */}
                    {cloud && (
                        <div className="flex items-center gap-0.5 text-[11px] bg-muted rounded-md p-0.5 ml-1">
                            <button
                                onClick={() => setMode('workspace')}
                                className={`px-2 py-0.5 rounded flex items-center gap-1 ${mode === 'workspace' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                title="Workspace — consumes credits">
                                <Bot className="h-3 w-3" />Workspace
                            </button>
                            <button
                                onClick={() => setMode('support')}
                                className={`px-2 py-0.5 rounded flex items-center gap-1 ${mode === 'support' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                title="Support — free, no credits used">
                                <MessageCircle className="h-3 w-3" />Support
                            </button>
                        </div>
                    )}
                </div>

                {/* Credit balance (cloud + workspace mode only) */}
                {creditsActive && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground" title="Workspace Agent credits remaining">
                        <span className={`flex items-center gap-1 ${(!dailyUnlimited && dailyLeft <= 0) ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                            <Zap className="h-3 w-3" />{dailyUnlimited ? '∞' : dailyLeft}<span className="opacity-60">/day</span>
                        </span>
                        {credits?.monthly_limit !== undefined && credits.monthly_limit !== 0 && (
                            <span className={`flex items-center gap-1 ${(!monthlyUnlimited && monthlyLeft <= 0) ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                {monthlyUnlimited ? '∞' : monthlyLeft}<span className="opacity-60">/mo</span>
                            </span>
                        )}
                    </div>
                )}

                {/* Provider & Model Selection (self-host only) */}
                {!cloud && providerStatus === 'ok' && (
                    <div className="flex items-center gap-2 text-xs">
                        <select
                            value={selectedProviderId}
                            onChange={onProviderChange}
                            className="bg-background border border-border rounded px-1.5 py-1 outline-none text-muted-foreground w-24 overflow-hidden text-ellipsis whitespace-nowrap"
                            disabled={isLoading}
                        >
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select
                            value={selectedModelId}
                            onChange={(e) => setSelectedModelId(e.target.value)}
                            className="bg-background border border-border rounded px-1.5 py-1 outline-none text-muted-foreground w-28 overflow-hidden text-ellipsis whitespace-nowrap"
                            disabled={isLoading}
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => setSettingsOpen(true)}
                        title="Agent settings"
                        aria-label="Agent settings"
                    >
                        <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4" ref={scrollRef}>
                    {providerStatus === 'checking' && (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {providerStatus === 'missing' && (
                        <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg p-3 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium text-amber-700 dark:text-amber-300">No LLM Provider Connected</p>
                                        <p className="text-amber-600 dark:text-amber-400 mt-1">
                                            Add an OpenAI, Anthropic, or Ollama provider in <strong>Edge Providers</strong> to use the workspace agent.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quota exhausted banner (cloud workspace mode) */}
                    {quotaInfo && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-amber-700 dark:text-amber-300">
                                        {quotaInfo.blocked ? 'Credit quota exhausted' : 'Approaching credit limit'}
                                    </p>
                                    {quotaInfo.resetsAt && (
                                        <p className="text-amber-600 dark:text-amber-400 mt-1 text-xs">
                                            {quotaInfo.pool === 'daily'
                                                ? `Daily credits reset at ${new Date(quotaInfo.resetsAt).toLocaleTimeString()}`
                                                : `Monthly credits reset on ${new Date(quotaInfo.resetsAt).toLocaleDateString()}`}
                                        </p>
                                    )}
                                    {mode === 'workspace' && !quotaInfo.resetsAt && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            Credits will reset shortly.
                                        </p>
                                    )}
                                    {mode === 'workspace' && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            Switch to <button onClick={() => setMode('support')} className="font-semibold underline">Support</button> for free help.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {providerStatus === 'ok' && messages.length === 0 && !quotaInfo && (
                        <div className="text-center text-muted-foreground py-10">
                            <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">
                                {cloud && mode === 'support'
                                    ? 'How can I help? (Support mode — free)'
                                    : 'How can I help you build today?'}
                            </p>
                        </div>
                    )}

                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                                m.role === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted/50 border border-border'
                            }`}>
                                <div className="whitespace-pre-wrap">{m.content}</div>
                            </div>
                        </div>
                    ))}
                    {isLoading && messages.length > 0 && !messages[messages.length - 1]?.content && (
                        <div className="flex justify-start">
                            <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                <span>Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="p-3 border-t border-border bg-muted/10">
                <form onSubmit={onSubmit} className="flex items-center gap-2">
                    <Input
                        value={localInput}
                        onChange={(e) => setLocalInput(e.target.value)}
                        placeholder={
                            providerStatus === 'missing'
                                ? 'Connect a provider first...'
                                : cloud
                                    ? (mode === 'support' ? 'Ask for support (free)…' : 'Ask the agent…')
                                    : `Ask ${selectedModelId || 'the agent'}...`
                        }
                        className="flex-1 bg-background"
                        disabled={isLoading || providerStatus === 'missing'}
                    />
                    <Button type="submit" disabled={isLoading || !localInput.trim() || providerStatus === 'missing'} size="sm">
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>

            <WorkspaceAgentSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
};
