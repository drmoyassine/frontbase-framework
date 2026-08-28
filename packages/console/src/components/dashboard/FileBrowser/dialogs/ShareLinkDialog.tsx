// ShareLinkDialog — Generate and share file links with configurable expiry

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Check, Copy, ExternalLink, Link, Loader2 } from 'lucide-react';
import { LINK_EXPIRY_OPTIONS } from '../constants';

interface ShareLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileName: string;
    isPublicBucket: boolean;
    /** Called to generate a URL with the selected expiry */
    onGenerateUrl: (expiresIn: number) => Promise<string>;
    /** Called to get the public URL (for public buckets) */
    onGetPublicUrl: () => Promise<string>;
}

export function ShareLinkDialog({
    open, onOpenChange, fileName, isPublicBucket,
    onGenerateUrl, onGetPublicUrl,
}: ShareLinkDialogProps) {
    const [expiry, setExpiry] = React.useState<number>(3600); // Default 1 hour
    const [generatedUrl, setGeneratedUrl] = React.useState<string>('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    // Reset state when dialog opens/closes
    React.useEffect(() => {
        if (!open) {
            setGeneratedUrl('');
            setCopied(false);
        }
    }, [open]);

    // For public buckets, auto-generate public URL on open
    React.useEffect(() => {
        if (open && isPublicBucket) {
            setIsLoading(true);
            onGetPublicUrl()
                .then((url) => setGeneratedUrl(url))
                .catch(() => setGeneratedUrl(''))
                .finally(() => setIsLoading(false));
        }
    }, [open, isPublicBucket]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerate = async () => {
        setIsLoading(true);
        setCopied(false);
        try {
            const url = await onGenerateUrl(expiry);
            setGeneratedUrl(url);
        } catch {
            setGeneratedUrl('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!generatedUrl) return;
        await navigator.clipboard.writeText(generatedUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenInBrowser = () => {
        if (generatedUrl) window.open(generatedUrl, '_blank');
    };

    const selectedExpiryLabel = LINK_EXPIRY_OPTIONS.find(o => o.value === expiry)?.label || '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        Share Link
                    </DialogTitle>
                    <DialogDescription>
                        Generate a shareable link for <span className="font-medium text-foreground">{fileName}</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {isPublicBucket ? (
                        <p className="text-sm text-muted-foreground">
                            This file is in a public bucket — the link does not expire.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            <Label>Link Expires In</Label>
                            <Select value={String(expiry)} onValueChange={(v) => setExpiry(Number(v))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select expiry..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {LINK_EXPIRY_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={String(opt.value)}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Generated URL display */}
                    {generatedUrl && (
                        <div className="grid gap-2">
                            <Label>Generated Link</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={generatedUrl}
                                    readOnly
                                    className="text-xs font-mono"
                                />
                                <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                            {!isPublicBucket && (
                                <p className="text-xs text-muted-foreground">
                                    This link will expire in {selectedExpiryLabel}.
                                </p>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter className="sm:justify-between">
                    {generatedUrl ? (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="outline" onClick={handleOpenInBrowser}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open
                            </Button>
                            <Button onClick={handleCopy}>
                                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button onClick={handleGenerate} disabled={isLoading}>
                                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Generate Link
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
