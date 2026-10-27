import { useEffect, useState } from 'react';
import { getSetupStatus, type SetupStatus } from '@/lib/api';
import { Setup } from '@/pages/Setup';

const PRODUCT_DASHBOARD = '/frontbase-admin/dashboard';

function leaveSetup(): void {
    window.location.replace(PRODUCT_DASHBOARD);
}

function Splash({ message = 'Loading…' }: { message?: string }) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{message}</div>;
}

/**
 * First-run setup is deliberately its own tiny application.
 *
 * CF-22 replaced the framework's original admin SPA with the product community
 * console at /frontbase-admin. Keeping the old dashboard router reachable below
 * /setup created two competing consoles and let setup finish at
 * /setup#/dashboard. This entry now owns only first-admin setup. Once an admin
 * exists, every /setup hash (including stale #/login and #/dashboard bookmarks)
 * exits to the product console.
 */
export function App() {
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        void getSetupStatus()
            .then((next) => {
                if (!active) return;
                if (!next.needsSetup) {
                    leaveSetup();
                    return;
                }
                setStatus(next);
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => { active = false; };
    }, []);

    if (failed) {
        return <Splash message="Unable to load setup. Refresh the page to try again." />;
    }
    if (!status) return <Splash />;
    return <Setup status={status} />;
}
