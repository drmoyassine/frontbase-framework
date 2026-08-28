/**
 * IpRetentionCard (Post-sprint 2.1)
 *
 * Controls how long security audit logs keep the FULL client IP before it is
 * purged (the anonymized /24 or /48 value is always retained). Full IPs are kept
 * short-term for new-IP login alerts — a GDPR legitimate interest.
 *
 * Dropped into the Audit Trail tab of SecuritySettingsForm.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, ShieldAlert } from 'lucide-react';
import { useSecuritySettings } from '../hooks/useSecuritySettings';

const PRESETS: { label: string; value: number }[] = [
    { label: 'Immediate', value: 0 },
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: 'Forever', value: -1 },
];

export function IpRetentionCard() {
    const {
        fullIpRetentionDays,
        setFullIpRetentionDays,
        isLoading,
        hasChanges,
        save,
        isSaving,
        saveSuccess,
    } = useSecuritySettings();

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading retention setting…
            </div>
        );
    }

    return (
        <Card className="transition-all duration-200 hover:shadow-md">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <ShieldAlert className="h-5 w-5 text-primary" />
                    Audit-log IP Retention
                </CardTitle>
                <CardDescription>
                    Full client IPs in security logs are purged after this window; the anonymized
                    value is retained. Use 0 for strictest privacy, -1 to retain indefinitely.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                        <Button
                            key={p.value}
                            variant={fullIpRetentionDays === p.value ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFullIpRetentionDays(p.value)}
                        >
                            {p.label}
                        </Button>
                    ))}
                </div>

                <div className="flex items-end gap-3">
                    <div className="space-y-2 max-w-[200px]">
                        <Label htmlFor="ip-retention">Retention (days)</Label>
                        <Input
                            id="ip-retention"
                            type="number"
                            value={fullIpRetentionDays}
                            onChange={(e) =>
                                setFullIpRetentionDays(parseInt(e.target.value || '0', 10) || 0)
                            }
                        />
                    </div>
                    <p className="text-xs text-muted-foreground pb-2">
                        {fullIpRetentionDays === 0
                            ? 'Full IPs anonymized immediately.'
                            : fullIpRetentionDays === -1
                                ? 'Full IPs retained indefinitely.'
                                : `Full IPs purged after ${fullIpRetentionDays} day(s).`}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={save} disabled={!hasChanges || isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save
                    </Button>
                    {saveSuccess && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                            <Check className="h-4 w-4" /> Saved
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
