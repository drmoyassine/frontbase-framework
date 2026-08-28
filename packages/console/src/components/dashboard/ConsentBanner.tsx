/**
 * GDPR consent banner (Sprint 3D).
 *
 * Shown only to EU/EEA users who haven't decided yet (`needsConsentBanner()`).
 * "Accept all" → grants analytics + marketing, then (re)initialises the SDKs so
 * they load for the rest of the session. "Reject" persists a denial so the banner
 * never re-appears; analytics stays off. Either choice dismisses the banner.
 *
 * Non-EU users never see it (implied consent). Mounted once at the app root.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { acceptAll, rejectAll, needsConsentBanner } from '@/lib/consent';
import { initAnalytics } from '@/lib/analytics';

export function ConsentBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(needsConsentBanner());
    }, []);

    if (!visible) return null;

    const onAccept = () => {
        acceptAll();
        // Consent was just granted — load PostHog + Sentry now (idempotent).
        initAnalytics();
        setVisible(false);
    };

    const onReject = () => {
        rejectAll();
        setVisible(false);
    };

    return (
        <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4">
            <Card className="flex max-w-3xl flex-col gap-3 border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <p className="text-sm text-muted-foreground">
                    We use analytics and error reporting to improve Frontbase. By clicking
                    &ldquo;Accept all&rdquo;, you consent to our use of these technologies. See our{' '}
                    <a href="/privacy" className="font-medium text-foreground underline underline-offset-2">
                        privacy policy
                    </a>
                    .
                </p>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={onReject}>
                        Reject
                    </Button>
                    <Button size="sm" onClick={onAccept}>
                        Accept all
                    </Button>
                </div>
            </Card>
        </div>
    );
}
