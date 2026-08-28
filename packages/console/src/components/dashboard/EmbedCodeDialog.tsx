import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy, AlertTriangle } from 'lucide-react';
import { AuthForm } from '@/types/auth-form';
import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';

interface EmbedCodeDialogProps {
    form: AuthForm | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EmbedCodeDialog({ form, open, onOpenChange }: EmbedCodeDialogProps) {
    const [copied, setCopied] = React.useState(false);
    const { data: engines = [] } = useEdgeEngines();

    if (!form) return null;

    // Use the first active engine's URL as the embed base URL.
    // In production, this is the edge engine where pages are published.
    // Falls back to the current origin for local dev.
    const activeEngine = engines.find(e => e.is_active && e.url);
    const edgeUrl = activeEngine?.url?.replace(/\/$/, '') || '';
    const hasEdgeEngine = !!edgeUrl;

    // For local dev, fallback to the edge engine dev port (3002)
    const baseUrl = hasEdgeEngine
        ? edgeUrl
        : `${window.location.protocol}//${window.location.hostname}:3002`;

    const scriptCode = `<script src="${baseUrl}/api/embed/embed.js" data-form-id="${form.id}" data-width="100%"></script>`;
    const directLink = `${baseUrl}/api/embed/auth/${form.id}`;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Embed {form.name}</DialogTitle>
                    <DialogDescription>
                        Use the code below to embed this form on any website.
                    </DialogDescription>
                </DialogHeader>

                {!hasEdgeEngine && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <p>
                            No active edge engine found. The embed code uses your local dev server.
                            Publish to an edge engine first for production use.
                        </p>
                    </div>
                )}

                <Tabs defaultValue="script">
                    <TabsList className="w-full">
                        <TabsTrigger value="script" className="flex-1">Smart Embed (Script)</TabsTrigger>
                        <TabsTrigger value="link" className="flex-1">Direct Link</TabsTrigger>
                    </TabsList>

                    <TabsContent value="script" className="space-y-4 pt-4">
                        <div className="relative">
                            <pre className="p-4 bg-slate-950 text-slate-50 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all max-w-full custom-scrollbar">
                                {scriptCode}
                            </pre>
                            <Button
                                size="icon"
                                variant="secondary"
                                className="absolute top-2 right-2 h-8 w-8"
                                onClick={() => copyToClipboard(scriptCode)}
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This script creates a responsive iframe that auto-resizes to fit the form content.
                        </p>
                    </TabsContent>

                    <TabsContent value="link" className="space-y-4 pt-4">
                        <div className="flex gap-2">
                            <Input value={directLink} readOnly />
                            <Button size="icon" variant="outline" onClick={() => copyToClipboard(directLink)}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Share this link to open the form in a full-page view.
                        </p>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
