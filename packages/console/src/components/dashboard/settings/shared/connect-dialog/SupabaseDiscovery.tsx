/**
 * SupabaseDiscovery — Post-test project picker for Supabase.
 *
 * Shows after a successful test-connection when the Supabase API returns
 * a list of projects. User picks which project to connect.
 */

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TestResult } from './useConnectProvider';

interface SupabaseDiscoveryProps {
    testResult: TestResult | null;
    discoveredProjects: { ref: string; name: string; region: string; status: string }[];
    selectedProjectRef: string;
    onProjectChange: (ref: string, projectName: string) => void;
}

export function SupabaseDiscovery({
    discoveredProjects,
    selectedProjectRef,
    onProjectChange,
}: SupabaseDiscoveryProps) {
    if (discoveredProjects.length === 0) return null;

    return (
        <div className="space-y-2">
            <Label>Select Project</Label>
            <Select value={selectedProjectRef} onValueChange={(val) => {
                const proj = discoveredProjects.find(p => p.ref === val);
                onProjectChange(val, proj?.name || '');
            }}>
                <SelectTrigger>
                    <SelectValue placeholder="Pick a Supabase project" />
                </SelectTrigger>
                <SelectContent>
                    {discoveredProjects.map(p => (
                        <SelectItem key={p.ref} value={p.ref}>
                            {p.name} <span className="text-muted-foreground ml-1">({p.region})</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
