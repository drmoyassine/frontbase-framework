/**
 * SecuritySettingsForm
 * 
 * Renders security diagnostics and status panels, manual IP blocklist control,
 * local WAF configurations, and security audit logs.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/services/api-service';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Shield,
    Lock,
    Bot,
    Key,
    AlertTriangle,
    CheckCircle2,
    HelpCircle,
    Info,
    Trash2,
    Plus,
    RefreshCw,
    Sliders,
    FileText,
    Globe
} from 'lucide-react';
import { isCloud } from '@/lib/edition';
import { IpRetentionCard } from './IpRetentionCard';
import { SecurityEventsPanel } from './SecurityEventsPanel';

interface SecuritySettingsFormProps {
    withCard?: boolean;
}

export function SecuritySettingsForm({ withCard = false }: SecuritySettingsFormProps) {
    const { user, _realUser } = useAuthStore();
    const isMaster = user?.is_master || _realUser?.is_master;
    const { toast } = useToast();
    
    // States
    const [wafEnabled, setWafEnabled] = React.useState(false);
    const [blocklist, setBlocklist] = React.useState<any[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSavingWaf, setIsSavingWaf] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    
    // Bot protection states
    const [botEnabled, setBotEnabled] = React.useState(false);
    const [botProvider, setBotProvider] = React.useState<'cloudflare' | 'recaptcha_v2' | 'recaptcha_v3'>('cloudflare');
    const [botSiteKey, setBotSiteKey] = React.useState('');
    const [botSecretKey, setBotSecretKey] = React.useState('');
    const [botProtectLogin, setBotProtectLogin] = React.useState(true);
    const [botProtectForgotPassword, setBotProtectForgotPassword] = React.useState(true);
    const [botRecaptchaV3Threshold, setBotRecaptchaV3Threshold] = React.useState(0.5);
    const [botWidgetTheme, setBotWidgetTheme] = React.useState<'light' | 'dark' | 'auto'>('auto');
    const [botWidgetSize, setBotWidgetSize] = React.useState<'normal' | 'compact' | 'invisible'>('normal');
    const [botAutoBanLockoutHours, setBotAutoBanLockoutHours] = React.useState(24);
    
    const [botMetrics, setBotMetrics] = React.useState({
        solve_rate: 0.0,
        total_challenges: 0,
        blocked_solves: 0,
        banned_ips: 0
    });
    const [isSavingBot, setIsSavingBot] = React.useState(false);
    
    // New ban form states
    const [newIpOrRange, setNewIpOrRange] = React.useState('');
    const [newReason, setNewReason] = React.useState('');
    const [isBanning, setIsBanning] = React.useState(false);

    // Diagnostics calculation
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    
    const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';
    const hasTurnstile = turnstileSiteKey !== '' || (botEnabled && botSiteKey !== '');

    // Fetch data
    const fetchSecurityData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        
        try {
            // Conditionally fetch global data (WAF and Audit Logs) only for master admin
            const endpoints = [
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/bot-protection'),
                api.get('/api/auth/security/bot-protection/metrics')
            ];
            
            let wafRes, auditRes;
            if (isMaster) {
                endpoints.push(api.get('/api/auth/security/waf'));
                endpoints.push(api.get('/api/auth/security/audit-logs'));
            }

            const results = await Promise.all(endpoints);
            
            const blockRes = results[0];
            const botSettingsRes = results[1];
            const botMetricsRes = results[2];

            if (isMaster) {
                wafRes = results[3];
                auditRes = results[4];
                setWafEnabled(wafRes.data.enabled);
                setAuditLogs(auditRes.data);
            }

            setBlocklist(blockRes.data);
            
            // Bot settings
            setBotEnabled(botSettingsRes.data.enabled);
            setBotProvider(botSettingsRes.data.provider);
            setBotSiteKey(botSettingsRes.data.site_key);
            setBotSecretKey(botSettingsRes.data.secret_key);
            setBotProtectLogin(botSettingsRes.data.protect_login);
            setBotProtectForgotPassword(botSettingsRes.data.protect_forgot_password);
            setBotRecaptchaV3Threshold(botSettingsRes.data.recaptcha_v3_threshold);
            setBotWidgetTheme(botSettingsRes.data.widget_theme);
            setBotWidgetSize(botSettingsRes.data.widget_size);
            setBotAutoBanLockoutHours(botSettingsRes.data.auto_ban_lockout_hours);
            
            // Bot metrics
            setBotMetrics(botMetricsRes.data);
        } catch (err: any) {
            console.error('Failed to load security settings:', err);
            toast({
                title: 'Error loading settings',
                description: err.response?.data?.detail || 'Failed to fetch security parameters from backend.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    React.useEffect(() => {
        fetchSecurityData();
    }, []);

    const handleSaveBotSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingBot(true);
        try {
            await api.post('/api/auth/security/bot-protection', {
                enabled: botEnabled,
                provider: botProvider,
                site_key: botSiteKey,
                secret_key: botSecretKey,
                protect_login: botProtectLogin,
                protect_forgot_password: botProtectForgotPassword,
                recaptcha_v3_threshold: botRecaptchaV3Threshold,
                widget_theme: botWidgetTheme,
                widget_size: botWidgetSize,
                auto_ban_lockout_hours: botAutoBanLockoutHours
            });
            toast({
                title: 'Bot Protection Updated',
                description: 'Bot protection settings have been saved successfully.',
            });
            await fetchSecurityData(true);
        } catch (err: any) {
            toast({
                title: 'Update Failed',
                description: err.response?.data?.detail || 'Failed to save bot protection settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingBot(false);
        }
    };

    // Toggle WAF handler
    const handleWafToggle = async (checked: boolean) => {
        setIsSavingWaf(true);
        try {
            await api.post('/api/auth/security/waf', { enabled: checked });
            setWafEnabled(checked);
            toast({
                title: checked ? 'WAF Enabled' : 'WAF Disabled',
                description: checked 
                    ? 'Incoming requests are now scanned for injection and XSS patterns.' 
                    : 'Web Application Firewall inspection has been deactivated.',
            });
            // Refresh audit logs
            const auditRes = await api.get('/api/auth/security/audit-logs');
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'WAF Update Failed',
                description: err.response?.data?.detail || 'Could not update firewall settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingWaf(false);
        }
    };

    // Add blocklist IP ban handler
    const handleAddBan = async (e: React.FormEvent) => {
        e.preventDefault();
        const ipToBan = newIpOrRange.trim();
        if (!ipToBan) return;
        
        setIsBanning(true);
        try {
            await api.post('/api/auth/security/blocklist', {
                ip_or_range: ipToBan,
                reason: newReason.trim() || undefined
            });
            
            toast({
                title: 'IP Address Blocked',
                description: `Successfully added block rules for ${ipToBan}`,
            });
            
            setNewIpOrRange('');
            setNewReason('');
            
            // Reload blocklist & audit logs
            const [blockRes, auditRes] = await Promise.all([
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/audit-logs')
            ]);
            setBlocklist(blockRes.data);
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'Operation Failed',
                description: err.response?.data?.detail || 'Verify IP formatting (e.g. 192.168.0.1 or 10.0.0.0/24).',
                variant: 'destructive',
            });
        } finally {
            setIsBanning(false);
        }
    };

    // Remove blocklist IP ban handler
    const handleRemoveBan = async (id: string, ipOrRange: string) => {
        try {
            await api.delete(`/api/auth/security/blocklist/${id}`);
            toast({
                title: 'Block Lifted',
                description: `${ipOrRange} has been unblocked.`,
            });
            
            // Reload blocklist & audit logs
            const [blockRes, auditRes] = await Promise.all([
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/audit-logs')
            ]);
            setBlocklist(blockRes.data);
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'Action Failed',
                description: err.response?.data?.detail || 'Failed to remove blocklist entry.',
                variant: 'destructive',
            });
        }
    };

    // Format action labels
    const renderActionBadge = (action: string) => {
        const styleMap: Record<string, string> = {
            'LOGIN_SUCCESS': 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-800',
            'IP_BANNED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800',
            'IP_UNBANNED': 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800',
            'WAF_TOGGLED': 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800',
            'WAF_BLOCKED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 font-bold',
            'WAF_AUDIT_ADMIN': 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800',
            'BOT_CHALLENGE_SUCCESS': 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-800',
            'BOT_CHALLENGE_FAILED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 font-bold',
            'BOT_PROTECTION_UPDATED': 'bg-indigo-500/10 text-indigo-600 border-indigo-200 dark:border-indigo-800',
            'IP_AUTO_BANNED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 font-bold',
        };
        
        const className = styleMap[action] || 'bg-muted text-muted-foreground';
        return (
            <Badge variant="outline" className={`${className} font-medium px-2 py-0.5 rounded-full text-[10px]`}>
                {action.replace('_', ' ')}
            </Badge>
        );
    };

    // Format date string beautifully
    const formatDate = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return isoString;
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground font-medium">Retrieving security parameters...</p>
            </div>
        );
    }

    const content = (
        <div className="space-y-6">
            <Tabs defaultValue={isMaster ? "firewall" : "bot"} className="w-full space-y-6">
                <TabsList className={`grid w-full max-w-[600px] ${isMaster ? 'grid-cols-5' : 'grid-cols-3'}`}>
                    {isMaster && (
                        <TabsTrigger value="firewall" className="gap-1.5">
                            <Shield className="h-4 w-4" />
                            Firewall & Headers
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="bot" className="gap-1.5">
                        <Bot className="h-4 w-4" />
                        Bot Protection
                    </TabsTrigger>
                    <TabsTrigger value="access" className="gap-1.5">
                        <Globe className="h-4 w-4" />
                        Access Control
                    </TabsTrigger>
                    {isMaster && (
                        <TabsTrigger value="audit" className="gap-1.5">
                            <FileText className="h-4 w-4" />
                            Audit Trail
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="events" className="gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        Security Events
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: Firewall & Security Headers */}
                <TabsContent value="firewall" className="space-y-6 outline-none">
                    {/* Section 1: Security Health & Diagnostics Checklist */}
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Master Email Status */}
                        <Card className="border-l-4 border-l-green-500 bg-green-500/5 transition-all duration-200 hover:shadow-md">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Master Admin Email</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    Custom Email Configured
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Master account email is customized and secured.
                                </p>
                            </CardContent>
                        </Card>

                        {/* Connection Protocol */}
                        <Card className={`border-l-4 transition-all duration-200 hover:shadow-md ${isHttps ? 'border-l-green-500 bg-green-500/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Connection Security</CardTitle>
                                {isHttps ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {isHttps ? 'HTTPS Connection' : 'HTTP Unsecured'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {isHttps 
                                        ? 'Traffic between browser and Edge Server is fully encrypted.' 
                                        : 'Warning: Frontbase is running over plain HTTP. Setup SSL/HTTPS for production.'
                                    }
                                </p>
                            </CardContent>
                        </Card>

                        {/* Bot Protection status */}
                        <Card className={`border-l-4 transition-all duration-200 hover:shadow-md ${botEnabled ? 'border-l-green-500 bg-green-500/5' : hasTurnstile ? 'border-l-green-500 bg-green-500/5' : 'border-l-blue-500 bg-blue-500/5'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Bot Protection Status</CardTitle>
                                {(botEnabled || hasTurnstile) ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <Info className="h-4 w-4 text-blue-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {botEnabled 
                                        ? botProvider === 'cloudflare' 
                                            ? 'Cloudflare Turnstile Active' 
                                            : botProvider === 'recaptcha_v2'
                                                ? 'reCAPTCHA v2 Active'
                                                : 'reCAPTCHA v3 Active'
                                        : hasTurnstile 
                                            ? 'Cloudflare Turnstile Active (Env)' 
                                            : 'Honeypot Shield Only'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {(botEnabled || hasTurnstile)
                                        ? 'CAPTCHA verification is actively protecting authentication endpoints.' 
                                        : 'Default invisible honeypot shield is active. Configure bot protection settings for CAPTCHAs.'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Section 2: WAF Firewall & Security Headers */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* WAF Switch Card */}
                        <Card className="transition-all duration-200 hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <Bot className="h-5 w-5 text-primary" />
                                    Web Application Firewall (WAF)
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 rounded font-normal">
                                        Anomaly Engine
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Scan incoming write payloads for SQL Injection and Cross-Site Scripting (XSS) using recursive decoding and weighted anomaly scoring.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                                    <div className="space-y-1">
                                        <Label htmlFor="waf-toggle" className="font-semibold block cursor-pointer">
                                            Local Anomaly Inspector
                                        </Label>
                                        <span className="text-xs text-muted-foreground block">
                                            {wafEnabled ? 'Scanning JSON fields recursively (block threshold: 5).' : 'Activate payload inspection rules.'}
                                        </span>
                                    </div>
                                    <Switch
                                        id="waf-toggle"
                                        checked={wafEnabled}
                                        onCheckedChange={handleWafToggle}
                                        disabled={isSavingWaf}
                                    />
                                </div>
                                <div className="text-xs space-y-1.5 text-muted-foreground p-3 border rounded border-dashed">
                                    <p className="font-semibold text-primary">Advanced Protections:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>Obfuscation Resilient:</strong> Decodes double URL encoding, HTML entities, and comment tricks.</li>
                                        <li><strong>Weighted Scoring:</strong> Isolated terms are allowed; combined malicious signals trigger block.</li>
                                        <li><strong>Admin Exemption:</strong> Design actions are logged but never blocked for authenticated admins.</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        {/* HTTP Security Headers Info Card */}
                        <Card className="transition-all duration-200 hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <Sliders className="h-5 w-5 text-primary" />
                                    HTTP Security Headers
                                </CardTitle>
                                <CardDescription>
                                    Global parameters injected into HTTP response streams to harden the client browser environment.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">X-Frame-Options</span>
                                        <Badge variant="secondary" className="font-mono bg-green-500/10 text-green-600 border-none">SAMEORIGIN</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">X-Content-Type-Options</span>
                                        <Badge variant="secondary" className="font-mono bg-green-500/10 text-green-600 border-none">nosniff</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">Strict-Transport-Security (HSTS)</span>
                                        <Badge variant="secondary" className="font-mono bg-blue-500/10 text-blue-600 border-none">max-age=31536000</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">Lockout Threshold</span>
                                        <Badge variant="secondary" className="font-mono bg-amber-500/10 text-amber-600 border-none">5 Failed Attempts</Badge>
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    * Strict-Transport-Security (HSTS) becomes active when <span className="font-semibold">DEPLOYMENT_MODE</span> matches production.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab 1.5: Bot Protection Configuration */}
                <TabsContent value="bot" className="space-y-6 outline-none">
                    {/* Metrics Dashboard Grid */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="transition-all duration-200 hover:shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Solve Success Rate</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{botMetrics.solve_rate}%</div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Percentage of solved checks</p>
                            </CardContent>
                        </Card>
                        <Card className="transition-all duration-200 hover:shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Challenges</CardTitle>
                                <Sliders className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{botMetrics.total_challenges}</div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Presented CAPTCHA tokens</p>
                            </CardContent>
                        </Card>
                        <Card className="transition-all duration-200 hover:shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blocked Bots</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{botMetrics.blocked_solves}</div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Failed verification tokens</p>
                            </CardContent>
                        </Card>
                        <Card className="transition-all duration-200 hover:shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto-Banned IPs</CardTitle>
                                <Lock className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{botMetrics.banned_ips}</div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Banned on repeated failures</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Settings Form */}
                    <Card className="transition-all duration-200 hover:shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Bot className="h-5 w-5 text-primary" />
                                Bot Protection Settings
                            </CardTitle>
                            <CardDescription>
                                Secure your administration panel endpoints using Cloudflare Turnstile or Google reCAPTCHA.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSaveBotSettings} className="space-y-6">
                                {/* Toggle Switch to Enable/Disable */}
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                                    <div className="space-y-1">
                                        <Label htmlFor="bot-toggle" className="font-semibold block cursor-pointer">
                                            Enable Bot Protection
                                        </Label>
                                        <span className="text-xs text-muted-foreground block">
                                            {botEnabled ? 'Verification is actively enforced.' : 'Allow logins without interactive CAPTCHA widgets.'}
                                        </span>
                                    </div>
                                    <Switch
                                        id="bot-toggle"
                                        checked={botEnabled}
                                        onCheckedChange={setBotEnabled}
                                    />
                                </div>

                                {botEnabled && (
                                    <div className="grid gap-6 md:grid-cols-2 p-4 border rounded-lg bg-muted/5">
                                        <div className="space-y-4">
                                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">General Configurations</h3>
                                            
                                            {/* Provider */}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bot-provider" className="text-xs font-semibold">CAPTCHA Provider</Label>
                                                <select
                                                    id="bot-provider"
                                                    value={botProvider}
                                                    onChange={(e) => setBotProvider(e.target.value as any)}
                                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                >
                                                    <option value="cloudflare">Cloudflare Turnstile</option>
                                                    <option value="recaptcha_v2">Google reCAPTCHA v2 (Checkbox)</option>
                                                    <option value="recaptcha_v3">Google reCAPTCHA v3 (Score-based)</option>
                                                </select>
                                            </div>

                                            {/* Site Key */}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bot-sitekey" className="text-xs font-semibold">Site Key</Label>
                                                <Input
                                                    id="bot-sitekey"
                                                    value={botSiteKey}
                                                    onChange={(e) => setBotSiteKey(e.target.value)}
                                                    placeholder="e.g. 0x4AAAAAA..."
                                                    required
                                                />
                                            </div>

                                            {/* Secret Key */}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bot-secretkey" className="text-xs font-semibold">Secret Key</Label>
                                                <Input
                                                    id="bot-secretkey"
                                                    type="password"
                                                    value={botSecretKey}
                                                    onChange={(e) => setBotSecretKey(e.target.value)}
                                                    placeholder="••••••••"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Enforcement & Layout</h3>

                                            {/* Protected Routes */}
                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold block">Protected Control Plane Routes</Label>
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={botProtectLogin}
                                                            onChange={(e) => setBotProtectLogin(e.target.checked)}
                                                            className="rounded border-input text-primary focus:ring-primary"
                                                        />
                                                        Protect Login Route (`/api/auth/login`)
                                                    </label>
                                                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={botProtectForgotPassword}
                                                            onChange={(e) => setBotProtectForgotPassword(e.target.checked)}
                                                            className="rounded border-input text-primary focus:ring-primary"
                                                        />
                                                        Protect Password Recovery Routes (`/forgot-password`, `/reset-password`)
                                                    </label>
                                                </div>
                                            </div>

                                            {/* reCAPTCHA v3 Threshold Slider */}
                                            {botProvider === 'recaptcha_v3' && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs">
                                                        <Label htmlFor="v3-slider" className="font-semibold">reCAPTCHA v3 Pass Threshold</Label>
                                                        <span className="font-mono font-bold text-primary">{botRecaptchaV3Threshold}</span>
                                                    </div>
                                                    <input
                                                        id="v3-slider"
                                                        type="range"
                                                        min="0.1"
                                                        max="1.0"
                                                        step="0.1"
                                                        value={botRecaptchaV3Threshold}
                                                        onChange={(e) => setBotRecaptchaV3Threshold(parseFloat(e.target.value))}
                                                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                                    />
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        Scores below this threshold are blocked as bots. Default is 0.5.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Auto-Ban Lockout Hours */}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="bot-lockout" className="text-xs font-semibold">Auto-Ban Lockout Duration (Hours)</Label>
                                                <Input
                                                    id="bot-lockout"
                                                    type="number"
                                                    min="1"
                                                    max="720"
                                                    value={botAutoBanLockoutHours}
                                                    onChange={(e) => setBotAutoBanLockoutHours(parseInt(e.target.value) || 24)}
                                                />
                                                <p className="text-[10px] text-muted-foreground">
                                                    IP addresses failing verification 5 times in 10 minutes are locked out for this period.
                                                </p>
                                            </div>

                                            {/* Appearance options */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="widget-theme" className="text-xs font-semibold">Widget Theme</Label>
                                                    <select
                                                        id="widget-theme"
                                                        value={botWidgetTheme}
                                                        onChange={(e) => setBotWidgetTheme(e.target.value as any)}
                                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none"
                                                    >
                                                        <option value="auto">Auto</option>
                                                        <option value="light">Light</option>
                                                        <option value="dark">Dark</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="widget-size" className="text-xs font-semibold">Widget Size</Label>
                                                    <select
                                                        id="widget-size"
                                                        value={botWidgetSize}
                                                        onChange={(e) => setBotWidgetSize(e.target.value as any)}
                                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none"
                                                    >
                                                        <option value="normal">Normal</option>
                                                        <option value="compact">Compact</option>
                                                        <option value="invisible">Invisible</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end pt-2">
                                    <Button type="submit" disabled={isSavingBot} className="flex items-center gap-1.5">
                                        {isSavingBot ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                                        Save Bot Protection Settings
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 2: IP Blocklist Access Control */}
                <TabsContent value="access" className="space-y-6 outline-none">
                    {/* Section 3: IP Blocklist Access Control */}
                    <Card className="transition-all duration-200 hover:shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Globe className="h-5 w-5 text-primary" />
                                IP & Range Access Control
                            </CardTitle>
                            <CardDescription>
                                Manually ban malicious IP addresses or whole network ranges using CIDR masks (e.g. 192.168.1.0/24).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleAddBan} className="grid gap-4 md:grid-cols-3 items-end">
                                <div className="space-y-2">
                                    <Label htmlFor="ip-ban-input" className="text-xs font-semibold">IP Address or CIDR Range</Label>
                                    <Input
                                        id="ip-ban-input"
                                        placeholder="e.g. 12.34.56.78"
                                        value={newIpOrRange}
                                        onChange={(e) => setNewIpOrRange(e.target.value)}
                                        required
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ip-reason-input" className="text-xs font-semibold">Reason (Optional)</Label>
                                    <Input
                                        id="ip-reason-input"
                                        placeholder="Suspicious scanning, brute-forcing, etc."
                                        value={newReason}
                                        onChange={(e) => setNewReason(e.target.value)}
                                        className="h-9"
                                    />
                                </div>
                                <Button type="submit" disabled={isBanning} className="h-9 flex items-center gap-1.5 justify-center">
                                    <Plus className="h-4 w-4" />
                                    Add Ban Rule
                                </Button>
                            </form>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[200px]">IP / Range</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead className="w-[180px]">Banned Date</TableHead>
                                            <TableHead className="w-[80px] text-center">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {blocklist.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                                                    No active manual IP blocklist rules configured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            blocklist.map((ban) => (
                                                <TableRow key={ban.id} className="transition-all hover:bg-muted/10">
                                                    <TableCell className="font-mono text-xs font-semibold">
                                                        <div className="flex items-center gap-2">
                                                            {ban.ip_or_range}
                                                            {ban.reason?.includes('WAF Auto-Ban') && (
                                                                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 text-[9px] px-1 py-0.5 rounded font-normal">
                                                                    Auto
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{ban.reason || 'None specified'}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{formatDate(ban.created_at)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => handleRemoveBan(ban.id, ban.ip_or_range)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 3: Security Audit Trail */}
                <TabsContent value="audit" className="space-y-6 outline-none">
                    {/* Post-sprint 2.1: configurable full-IP retention for audit logs */}
                    <IpRetentionCard />

                    {/* Section 4: Security Audit Trail */}
                    <Card className="transition-all duration-200 hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <FileText className="h-5 w-5 text-primary" />
                                    Security Audit Trail
                                </CardTitle>
                                <CardDescription>
                                    Tracks administrator settings changes, ban adjustments, and authentication events.
                                </CardDescription>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                onClick={() => fetchSecurityData(true)}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm border-b">
                                        <TableRow>
                                            <TableHead className="w-[180px]">Timestamp</TableHead>
                                            <TableHead className="w-[120px]">Event</TableHead>
                                            <TableHead className="w-[120px]">IP Address</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                                                    No recent security logs captured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            auditLogs.map((log) => (
                                                <TableRow key={log.id} className="transition-all hover:bg-muted/10">
                                                    <TableCell className="text-xs font-medium">{formatDate(log.created_at)}</TableCell>
                                                    <TableCell>{renderActionBadge(log.action)}</TableCell>
                                                    <TableCell className="font-mono text-[11px] text-muted-foreground">{log.ip_address || 'unknown'}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]" title={log.details}>
                                                        {log.details || 'No details'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 4: Security Events */}
                <TabsContent value="events" className="space-y-6 outline-none">
                    <SecurityEventsPanel withCard />
                </TabsContent>
            </Tabs>

            {isCloud() && (
                <>
                    <Separator />
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 dark:text-blue-400 flex items-start gap-3">
                        <HelpCircle className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="font-semibold">SuperTokens Engine Enabled</p>
                            <p className="text-xs opacity-90">
                                This instance is operating in Cloud Mode. Master administrator accounts are protected via Frontbase's built-in lockout parameters, while tenant user authentication, sessions, and secondary security checks are delegated directly to SuperTokens Cloud.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        Security Settings
                    </CardTitle>
                    <CardDescription>
                        Monitor brute-force lockout status, configure Web Application Firewall, block manual IP addresses, and inspect audit logs.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {content}
                </CardContent>
            </Card>
        );
    }

    return <div className="space-y-6">{content}</div>;
}
