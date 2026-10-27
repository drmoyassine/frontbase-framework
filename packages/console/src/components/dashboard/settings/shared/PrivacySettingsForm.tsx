/**
 * PrivacySettingsForm
 * 
 * Reusable form component for Privacy & Tracking configuration.
 * Uses usePrivacySettings hook for state management.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, Shield, Globe } from 'lucide-react';
import { usePrivacySettings } from '../hooks/usePrivacySettings';
import { AdvancedVariables, CookieVariables } from '@/modules/dbsync/types';

// Variable metadata for rendering
const BASIC_VARIABLES = [
    { path: 'visitor.country', description: 'Country name (e.g., Kuwait, USA)' },
    { path: 'visitor.city', description: 'City name (e.g., Kuwait City, Dubai)' },
    { path: 'visitor.timezone', description: 'UTC offset (e.g., +03:00, -05:00)' },
    { path: 'visitor.device', description: 'Device type: mobile, tablet, or desktop' },
];

const ADVANCED_VARIABLE_META: { key: keyof AdvancedVariables; path: string; description: string }[] = [
    { key: 'ip', path: 'visitor.ip', description: 'Visitor IP (privacy sensitive)' },
    { key: 'browser', path: 'visitor.browser', description: 'Chrome, Safari, Firefox, Edge' },
    { key: 'os', path: 'visitor.os', description: 'Windows, macOS, iOS, Android' },
    { key: 'language', path: 'visitor.language', description: 'Browser language (en, ar)' },
    { key: 'viewport', path: 'visitor.viewport', description: 'Browser window size (1440x900)' },
    { key: 'themePreference', path: 'visitor.themePreference', description: 'Dark/light mode preference' },
    { key: 'connectionType', path: 'visitor.connectionType', description: 'Network type (4g, wifi)' },
    { key: 'referrer', path: 'visitor.referrer', description: 'Referring URL' },
    { key: 'isBot', path: 'visitor.isBot', description: 'Identify crawlers and bots' },
];

const COOKIE_VARIABLE_META: { key: keyof CookieVariables; path: string; description: string }[] = [
    { key: 'isFirstVisit', path: 'visitor.isFirstVisit', description: 'Is this the first visit?' },
    { key: 'visitCount', path: 'visitor.visitCount', description: 'Total visit count' },
    { key: 'firstVisitAt', path: 'visitor.firstVisitAt', description: 'First visit timestamp' },
    { key: 'landingPage', path: 'visitor.landingPage', description: 'Original landing page URL' },
];

interface PrivacySettingsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

export function PrivacySettingsForm({ withCard = false }: PrivacySettingsFormProps) {
    const {
        enableVisitorTracking,
        cookieExpiryDays,
        requireCookieConsent,
        advancedVariables,
        cookieVariables,
        ga4MeasurementId,
        gtmContainerId,
        customHeadHtml,
        setEnableVisitorTracking,
        setCookieExpiryDays,
        setRequireCookieConsent,
        setGa4MeasurementId,
        setGtmContainerId,
        setCustomHeadHtml,
        isLoading,
        hasChanges,
        handleChange,
        handleAdvancedChange,
        handleCookieChange,
        save,
        isSaving,
        saveSuccess,
    } = usePrivacySettings();

    const content = (
        <>
            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading settings...
                </div>
            ) : (
                <>
                    {/* Section 1: Basic Variables (Always Available) */}
                    <div className="space-y-4">
                        <div>
                            <Label className="text-base font-semibold flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                Basic Variables (Always Available)
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1">
                                These variables are always collected and available in templates. No configuration needed.
                            </p>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium">Variable</th>
                                        <th className="text-center px-4 py-2 font-medium w-24">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {BASIC_VARIABLES.map((v) => (
                                        <tr key={v.path} className="border-t">
                                            <td className="px-4 py-3">
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">{v.path}</code>
                                                <div className="text-xs text-muted-foreground mt-1">{v.description}</div>
                                            </td>
                                            <td className="text-center px-4 py-3">
                                                <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">Always On</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Separator />

                    {/* Section 2: Advanced Variables (Configurable) */}
                    <div className="space-y-4">
                        <div>
                            <Label className="text-base font-semibold">⚙️ Advanced Variables</Label>
                            <p className="text-sm text-muted-foreground mt-1">
                                Configure collection and exposure of extended visitor data. When "Expose" is enabled, variables appear in the @ picker.
                            </p>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium">Variable</th>
                                        <th className="text-center px-4 py-2 font-medium w-24">Collect</th>
                                        <th className="text-center px-4 py-2 font-medium w-24">Expose</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ADVANCED_VARIABLE_META.map(({ key, path, description }) => (
                                        <tr key={key} className="border-t">
                                            <td className="px-4 py-3">
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">{path}</code>
                                                <div className="text-xs text-muted-foreground mt-1">{description}</div>
                                            </td>
                                            <td className="text-center px-4 py-3">
                                                <Switch
                                                    checked={advancedVariables[key].collect}
                                                    onCheckedChange={(c) => handleAdvancedChange(key, 'collect', c)}
                                                />
                                            </td>
                                            <td className="text-center px-4 py-3">
                                                <Switch
                                                    checked={advancedVariables[key].expose}
                                                    disabled={!advancedVariables[key].collect}
                                                    onCheckedChange={(c) => handleAdvancedChange(key, 'expose', c)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Separator />

                    {/* Section 3: Cookie-Based Variables (Repeat Visits) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base font-semibold">🍪 Cookie-Based Variables</Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Track repeat visits using cookies. Enables first visit detection and visit counting.
                                </p>
                            </div>
                            <Switch
                                checked={enableVisitorTracking}
                                onCheckedChange={(checked) => { setEnableVisitorTracking(checked); handleChange(); }}
                            />
                        </div>

                        {enableVisitorTracking && (
                            <>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="text-left px-4 py-2 font-medium">Variable</th>
                                                <th className="text-center px-4 py-2 font-medium w-24">Collect</th>
                                                <th className="text-center px-4 py-2 font-medium w-24">Expose</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {COOKIE_VARIABLE_META.map(({ key, path, description }) => (
                                                <tr key={key} className="border-t">
                                                    <td className="px-4 py-3">
                                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">{path}</code>
                                                        <div className="text-xs text-muted-foreground mt-1">{description}</div>
                                                    </td>
                                                    <td className="text-center px-4 py-3">
                                                        <Switch
                                                            checked={cookieVariables[key].collect}
                                                            onCheckedChange={(c) => handleCookieChange(key, 'collect', c)}
                                                        />
                                                    </td>
                                                    <td className="text-center px-4 py-3">
                                                        <Switch
                                                            checked={cookieVariables[key].expose}
                                                            disabled={!cookieVariables[key].collect}
                                                            onCheckedChange={(c) => handleCookieChange(key, 'expose', c)}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="cookie-expiry">Cookie expiry (days)</Label>
                                        <Input
                                            id="cookie-expiry"
                                            type="number"
                                            value={cookieExpiryDays}
                                            onChange={(e) => { setCookieExpiryDays(parseInt(e.target.value)); handleChange(); }}
                                            min={1}
                                            max={730}
                                            className="max-w-[200px]"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            How long to remember visitors (1-730 days)
                                        </p>
                                    </div>

                                    <div className="flex items-start justify-between">
                                        <div className="space-y-0.5">
                                            <Label>Require cookie consent</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Show consent before setting cookies (GDPR)
                                            </p>
                                        </div>
                                        <Switch
                                            checked={requireCookieConsent}
                                            onCheckedChange={(checked) => { setRequireCookieConsent(checked); handleChange(); }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <Separator />

                    {/* Section 4: Builder Analytics (GA4 / GTM / custom head) — Sprint 4A */}
                    <div className="space-y-4">
                        <div>
                            <Label className="text-base font-semibold flex items-center gap-2">
                                📊 Builder Analytics
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1">
                                Inject Google Analytics / Tag Manager into your published pages.
                                GTM takes precedence when both are set.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="ga4-id">GA4 Measurement ID</Label>
                                <Input
                                    id="ga4-id"
                                    value={ga4MeasurementId}
                                    onChange={(e) => { setGa4MeasurementId(e.target.value); handleChange(); }}
                                    placeholder="G-XXXXXXXXXX"
                                    className="max-w-[260px]"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Direct GA4 (ignored if GTM is set).
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="gtm-id">GTM Container ID</Label>
                                <Input
                                    id="gtm-id"
                                    value={gtmContainerId}
                                    onChange={(e) => { setGtmContainerId(e.target.value); handleChange(); }}
                                    placeholder="GTM-XXXXXXX"
                                    className="max-w-[260px]"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Loads GA4 (and other tags) via Tag Manager.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="custom-head">Custom &lt;head&gt; HTML</Label>
                            <textarea
                                id="custom-head"
                                value={customHeadHtml}
                                onChange={(e) => { setCustomHeadHtml(e.target.value); handleChange(); }}
                                placeholder={'<meta name="facebook-domain-verification" content="...">\n<script>/* pixel */</script>'}
                                rows={4}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-ring outline-none"
                            />
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                ⚠️ Raw HTML — you control your own pages. Avoid pasting untrusted code (XSS).
                            </p>
                        </div>
                    </div>

                    <Separator />

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={save}
                            disabled={!hasChanges || isSaving}
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Save Privacy Settings
                        </Button>
                        {saveSuccess && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                                <Check className="h-4 w-4" /> Saved
                            </span>
                        )}
                    </div>
                </>
            )}
        </>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Privacy & Tracking
                    </CardTitle>
                    <CardDescription>
                        Configure visitor tracking to enable personalization features
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
