/**
 * RedisSettingsForm
 * 
 * Edge Caching configuration — card-list pattern matching
 * Edge Database and Deployment Targets tabs.
 * 
 * Layout:
 * 1. Cache provider list (Local Redis = system/undeletable, Upstash = optional)
 * 2. "+ Add Cache Provider" button
 * 3. Collapsible Cache TTL section
 */

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Loader2, Check, X, Zap, Shield, Plus, Trash2, Cloud,
    HardDrive, ChevronDown, ChevronRight, Wifi, WifiOff, Settings2,
} from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useRedisSettings } from '../hooks/useRedisSettings';

interface RedisSettingsFormProps {
    withCard?: boolean;
}

export const RedisSettingsForm: React.FC<RedisSettingsFormProps> = ({ withCard = false }) => {
    const {
        redisUrl, redisToken, redisType, redisEnabled,
        cacheTtlData, cacheTtlCount,
        setRedisUrl, setRedisToken, setRedisType,
        setRedisEnabled, setCacheTtlData, setCacheTtlCount,
        isLoading, hasChanges, testResult,
        save, testConnection, handleChange,
        isSaving, isTesting, saveSuccess,
        hasLocalRedis, isUpstashConnected,
    } = useRedisSettings();

    const [showAddFlow, setShowAddFlow] = useState(false);
    const [showTtl, setShowTtl] = useState(false);

    // Add Upstash form fields (separate from the hook's managed state)
    const [addUrl, setAddUrl] = useState('');
    const [addToken, setAddToken] = useState('');

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const handleAddUpstash = () => {
        setRedisType('upstash');
        setRedisUrl(addUrl);
        setRedisToken(addToken);
        setRedisEnabled(true);
        // Save will be done by the user clicking "Save Changes" or we can auto-save
        setShowAddFlow(false);
        setAddUrl('');
        setAddToken('');
        // Trigger save
        setTimeout(() => save(), 50);
    };

    const handleRemoveUpstash = () => {
        setRedisType('self-hosted');
        setRedisUrl('http://redis:80');
        setRedisToken('');
        setRedisEnabled(true);
        setTimeout(() => save(), 50);
    };

    const handleTestLocal = () => {
        // Temporarily switch context for test
        setRedisType('self-hosted');
        testConnection();
    };

    const handleTestUpstash = () => {
        setRedisType('upstash');
        testConnection();
    };

    // Build cache provider entries
    const entries: Array<{
        id: string;
        name: string;
        provider: string;
        icon: React.ReactNode;
        subtitle: string;
        isSystem: boolean;
        isActive: boolean;
        canTest: boolean;
    }> = [];

    // Local Redis — always present, system entry
    entries.push({
        id: 'local-redis',
        name: 'Local Redis',
        provider: 'self-hosted',
        icon: <HardDrive className="h-4 w-4" />,
        subtitle: 'Docker container redis:80',
        isSystem: true,
        isActive: redisType === 'self-hosted',
        canTest: true,
    });

    // Upstash — only if connected
    if (isUpstashConnected || redisType === 'upstash') {
        entries.push({
            id: 'upstash',
            name: 'Upstash Redis',
            provider: 'upstash',
            icon: <Cloud className="h-4 w-4" />,
            subtitle: redisUrl || 'Serverless Redis',
            isSystem: false,
            isActive: redisType === 'upstash',
            canTest: true,
        });
    }

    const formContent = (
        <div className="space-y-4">
            {/* Cache provider list */}
            <div className="space-y-3">
                {entries.map(entry => (
                    <div key={entry.id} className={`rounded-lg border bg-card ${entry.isActive ? 'ring-1 ring-primary/20' : ''}`}>
                        {/* Row header */}
                        <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                                {entry.icon}
                                <span className="font-medium">{entry.name}</span>
                                <Badge variant="outline" className="text-xs">{entry.provider}</Badge>
                                {entry.isSystem && (
                                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 bg-blue-50">
                                        <Shield className="h-3 w-3 mr-1" />System
                                    </Badge>
                                )}
                                {entry.isActive && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                        <Check className="h-3 w-3" /> Active
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {entry.subtitle}
                                </span>

                                {/* Test result */}
                                {testResult && ((entry.id === 'local-redis' && redisType === 'self-hosted') || (entry.id === 'upstash' && redisType === 'upstash')) && (
                                    <span className={`text-xs flex items-center gap-1 ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                                        {testResult.success ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                                        {testResult.message}
                                    </span>
                                )}

                                {/* Test button */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => entry.id === 'local-redis' ? handleTestLocal() : handleTestUpstash()}
                                    disabled={isTesting}
                                    className="text-xs h-7 px-2"
                                >
                                    {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                </Button>

                                {/* Delete — only for non-system */}
                                {!entry.isSystem && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Remove Upstash?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will disconnect Upstash Redis and fall back to Local Redis. Your Upstash account is not affected.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleRemoveUpstash}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Remove
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}

                                {/* TTL accordion toggle — only on active entry */}
                                {entry.isActive && (
                                    <button
                                        type="button"
                                        onClick={() => setShowTtl(!showTtl)}
                                        className="p-1 rounded hover:bg-accent/50 transition-colors"
                                        title="Cache TTL Settings"
                                    >
                                        {showTtl ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Accordion TTL section — inside the active entry */}
                        {entry.isActive && showTtl && (
                            <div className="px-4 pb-4 border-t pt-3 space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <Settings2 className="h-3.5 w-3.5" />
                                    Cache TTL Settings
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Data Cache (seconds)</Label>
                                        <Input
                                            type="number"
                                            value={cacheTtlData}
                                            onChange={e => { setCacheTtlData(Number(e.target.value)); handleChange(); }}
                                            min={0}
                                        />
                                        <p className="text-xs text-muted-foreground">How long to cache record data</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Count Cache (seconds)</Label>
                                        <Input
                                            type="number"
                                            value={cacheTtlCount}
                                            onChange={e => { setCacheTtlCount(Number(e.target.value)); handleChange(); }}
                                            min={0}
                                        />
                                        <p className="text-xs text-muted-foreground">How long to cache record counts</p>
                                    </div>
                                </div>

                                {hasChanges && (
                                    <Button onClick={save} disabled={isSaving} size="sm">
                                        {isSaving ? (
                                            <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving...</>
                                        ) : (
                                            <><Check className="mr-2 h-3 w-3" /> Save Changes</>
                                        )}
                                    </Button>
                                )}

                                {saveSuccess && (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                        <Check className="h-3 w-3" /> Saved
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add Cache Provider flow */}
            {showAddFlow ? (
                <div className="p-4 rounded-lg border border-dashed space-y-4">
                    <Label className="text-sm font-medium">Connect Upstash</Label>
                    <p className="text-xs text-muted-foreground">
                        Serverless Redis for globally distributed edge caching.{' '}
                        <a href="https://upstash.com" target="_blank" rel="noopener noreferrer" className="underline">upstash.com</a>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">REST URL</Label>
                            <Input
                                type="password"
                                placeholder="https://...upstash.io"
                                value={addUrl}
                                onChange={e => setAddUrl(e.target.value)}
                                className="text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">REST Token</Label>
                            <Input
                                type="password"
                                placeholder="AX..."
                                value={addToken}
                                onChange={e => setAddToken(e.target.value)}
                                className="text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleAddUpstash} disabled={!addUrl || !addToken}>
                            <Check className="mr-2 h-4 w-4" /> Connect
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowAddFlow(false); setAddUrl(''); setAddToken(''); }}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                /* Only show "Add" if Upstash not already connected */
                !isUpstashConnected && redisType !== 'upstash' && (
                    <Button variant="outline" onClick={() => setShowAddFlow(true)} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Cache Provider
                    </Button>
                )
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Edge Caching
                    </CardTitle>
                    <CardDescription>
                        Redis-powered caching for fast data loading across your pages
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
