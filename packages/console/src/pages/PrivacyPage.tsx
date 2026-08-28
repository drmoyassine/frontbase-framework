/**
 * Privacy policy page (Sprint 3D).
 *
 * Public (no auth) so the consent banner + footers can link to it. The canonical
 * template lives at docs/templates/privacy-policy.md; this component renders a
 * hostable summary. Operators should replace [COMPANY_NAME] / [EMAIL] /
 * [RETENTION_PERIOD] with their details before go-live.
 */
import { Link } from 'react-router-dom';

const SECTIONS: { title: string; body: string }[] = [
    {
        title: '1. Who we are',
        body: '[COMPANY_NAME] operates Frontbase. For privacy requests, contact [EMAIL].',
    },
    {
        title: '2. What we collect',
        body: 'Account details (name, email), the data you connect through your own providers, and limited usage analytics (page views, feature events) when you consent. We do not access the contents of your connected databases beyond what is required to serve your app.',
    },
    {
        title: '3. Analytics & error reporting',
        body: 'For users in the EU/EEA, analytics (PostHog) and error monitoring (Sentry) only run after you explicitly consent via the banner. Visitor IPs are masked at capture time. You can withdraw consent at any time.',
    },
    {
        title: '4. Data retention',
        body: 'We retain account data for [RETENTION_PERIOD]. Data you store through connected providers is subject to those providers’ own retention policies; we delete our records of it on account deletion.',
    },
    {
        title: '5. Your rights (GDPR)',
        body: 'You have the right to access, rectify, erase, restrict, port, and object to processing, and to withdraw consent. Email [EMAIL] to exercise these rights.',
    },
    {
        title: '6. Security',
        body: 'Credentials are encrypted at rest (AES-256). All traffic is over HTTPS. Provider credentials are never exposed to end-users.',
    },
];

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background px-4 py-12">
            <article className="prose prose-sm dark:prose-invert mx-auto max-w-2xl">
                <h1>Privacy Policy</h1>
                <p className="text-muted-foreground">Last updated: 2026-06-22</p>
                {SECTIONS.map((s) => (
                    <section key={s.title}>
                        <h2>{s.title}</h2>
                        <p>{s.body}</p>
                    </section>
                ))}
                <p className="pt-4">
                    <Link to="/dashboard" className="text-primary underline">
                        Back to Frontbase
                    </Link>
                </p>
            </article>
        </div>
    );
}
