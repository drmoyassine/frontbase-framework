import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/** Placeholder for nav items whose framework backend doesn't exist yet (CF-21
 *  gaps: Data Studio, App Users, File Storage, Automations, Edge Resources,
 *  Settings, Plans). Rendered so the shell matches image 4; each is a later phase. */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{title}</h1>
                <Badge variant="secondary">coming soon</Badge>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Not available in this build</CardTitle>
                    <CardDescription>{description ?? `${title} requires framework backend work tracked as a later phase (see CF-21 parity audit).`}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        The console shell, auth, pages, and tenants are live. This section ships once its backend
                        is ported to the framework.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
