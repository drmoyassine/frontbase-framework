import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Lock, CloudDownload, FileArchive } from 'lucide-react';
import { usePlanFeature } from '@/hooks/useMyPlan';
import { FetchEnginesDialog } from './FetchEnginesDialog';
import { ImportEngineDialog } from './ImportEngineDialog';

/**
 * The single toolbar entry-point for engine import — both import paths
 * (discovery from a connected provider, and a pasted export bundle) live
 * behind it. Plan-gated: the `engine_imports` feature flag must be on
 * (community/free is locked; the backend enforces the same default).
 */
export function ImportEngineMenu() {
    const { allowed, loading } = usePlanFeature('engine_imports');
    const [openDialog, setOpenDialog] = useState<'provider' | 'bundle' | null>(null);

    // Community/free: one locked button that says why, instead of two entry
    // points that 403 after the fact. Loading also fails closed.
    if (!allowed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline" size="sm" className="h-8 gap-1.5"
                        disabled={loading}
                        aria-label="Import engines (requires an upgraded plan)"
                    >
                        {loading
                            ? <Download className="h-4 w-4" />
                            : <Lock className="h-4 w-4 text-muted-foreground" />}
                        Import
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Engine import requires an upgraded plan</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5">
                        <Download className="h-4 w-4" /> Import
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setOpenDialog('provider')}>
                        <CloudDownload className="h-4 w-4 mr-2" />
                        From connected provider
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setOpenDialog('bundle')}>
                        <FileArchive className="h-4 w-4 mr-2" />
                        From export bundle
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <FetchEnginesDialog
                open={openDialog === 'provider'}
                onOpenChange={(o) => setOpenDialog(o ? 'provider' : null)}
            />
            <ImportEngineDialog
                open={openDialog === 'bundle'}
                onOpenChange={(o) => setOpenDialog(o ? 'bundle' : null)}
            />
        </>
    );
}
