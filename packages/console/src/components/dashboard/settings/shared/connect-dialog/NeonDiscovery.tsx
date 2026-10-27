/**
 * NeonDiscovery — Post-test org → project picker for Neon.
 *
 * Shows after a successful test-connection when Neon API returns orgs.
 * User picks org, then project within that org.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { API_BASE } from '../edgeConstants';

interface NeonDiscoveryProps {
    neonOrgs: { id: string; name: string }[];
    credFields: Record<string, string>;
    onOrgChange: (orgId: string, orgName: string) => void;
    onProjectChange: (projectId: string, projectName: string) => void;
    selectedNeonOrg: string;
    selectedNeonProject: string;
}

export function NeonDiscovery({
    neonOrgs,
    credFields,
    onOrgChange,
    onProjectChange,
    selectedNeonOrg,
    selectedNeonProject,
}: NeonDiscoveryProps) {
    const [projects, setProjects] = useState<{ id: string; name: string; region: string }[]>([]);
    const [isFetching, setIsFetching] = useState(false);

    // Fetch projects when org changes
    useEffect(() => {
        if (!selectedNeonOrg) return;
        setIsFetching(true);
        setProjects([]);
        fetch(`${API_BASE}/api/edge-providers/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'neon', credentials: { ...credFields, org_id: selectedNeonOrg } }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.neon_projects?.length > 0) {
                    setProjects(data.neon_projects);
                    const first = data.neon_projects[0];
                    onProjectChange(first.id, first.name);
                }
            })
            .catch(() => { /* non-fatal */ })
            .finally(() => setIsFetching(false));
    }, [selectedNeonOrg]);

    if (neonOrgs.length === 0) return null;

    return (
        <>
            {/* Org picker */}
            <div className="space-y-2">
                <Label>Select Organization</Label>
                <Select value={selectedNeonOrg} onValueChange={(val) => {
                    const org = neonOrgs.find(o => o.id === val);
                    onOrgChange(val, org?.name || '');
                }}>
                    <SelectTrigger>
                        <SelectValue placeholder="Pick a Neon organization" />
                    </SelectTrigger>
                    <SelectContent>
                        {neonOrgs.map(o => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Project picker */}
            {projects.length > 0 && (
                <div className="space-y-2">
                    <Label>Select Project</Label>
                    <Select value={selectedNeonProject} onValueChange={(val) => {
                        const proj = projects.find(p => p.id === val);
                        onProjectChange(val, proj?.name || '');
                    }}>
                        <SelectTrigger>
                            <SelectValue placeholder="Pick a Neon project" />
                        </SelectTrigger>
                        <SelectContent>
                            {projects.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name} <span className="text-muted-foreground ml-1">({p.region})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Loading indicator */}
            {isFetching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching projects…
                </div>
            )}
        </>
    );
}
