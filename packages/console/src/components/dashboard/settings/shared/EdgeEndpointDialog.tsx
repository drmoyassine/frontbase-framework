import React, { useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Cpu, Copy, Check, ExternalLink, Zap, Loader2 } from 'lucide-react';
import { API_BASE } from './edgeConstants';
import { toast } from 'sonner';
import { showTestToast } from './edgeTestToast';

interface EdgeEndpointDialogProps {
    engineName: string;
    engineUrl: string;
    engineId: string;
    trigger?: React.ReactNode;
}

export const EdgeEndpointDialog: React.FC<EdgeEndpointDialogProps> = ({ engineName, engineUrl, engineId, trigger }) => {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [testing, setTesting] = useState(false);

    const fullUrl = engineUrl.startsWith('http') ? engineUrl : `https://${engineUrl}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
    };

    const handleOpen = () => {
        window.open(fullUrl, '_blank', 'noreferrer');
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await fetch(`${API_BASE}/api/edge-engines/${engineId}/test`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Test failed');
            showTestToast(
                { success: true, message: `Connected to engine in ${data.latency_ms ?? '?'}ms` },
                engineName
            );
        } catch (err: any) {
            showTestToast(
                { success: false, message: err.message || 'Connection failed' },
                engineName
            );
        } finally {
            setTesting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" title="Edge Endpoint Details">
                        <Cpu className="h-4 w-4 text-blue-400" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-[550px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5 text-blue-500" />
                        Edge Endpoint Details
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Engine name */}
                    <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Engine</p>
                        <p className="text-sm font-medium">{engineName}</p>
                    </div>

                    {/* Endpoint URL + actions */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Endpoint URL</p>
                        <div className="flex items-center gap-2 bg-muted p-2.5 rounded-md border font-mono text-xs min-w-0 overflow-hidden">
                            <span className="flex-1 min-w-0 truncate text-blue-400">{fullUrl}</span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy URL">
                                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpen} title="Open in browser">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleTest} disabled={testing} title="Test endpoint">
                                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
