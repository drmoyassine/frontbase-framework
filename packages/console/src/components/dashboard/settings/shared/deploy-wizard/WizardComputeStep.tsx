/**
 * WizardComputeStep — Step 1: Choose CPU vs GPU vs Community compute type.
 * Clicking a card auto-advances to Step 2 (provider).
 *
 * Community card is gated by isCloud() && is_master status.
 */

import { Cpu, Brain, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isCloud } from '@/lib/edition';
import { useAuthStore } from '@/stores/auth';
import type { DeployWizardState } from './useDeployWizard';

export function WizardComputeStep({ computeType, selectComputeAndProceed }: DeployWizardState) {
    const user = useAuthStore((s) => s.user);
    const _realUser = useAuthStore((s) => s._realUser);
    const isMaster = user?.is_master || _realUser?.is_master;
    const showCommunity = isCloud() && isMaster;

    return (
        <div className={`grid gap-3 ${showCommunity ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button
                type="button"
                onClick={() => selectComputeAndProceed('cpu')}
                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'cpu'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                    }`}
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <Cpu className="w-5 h-5 text-blue-500 shrink-0" />
                    <span className="font-semibold text-sm">CPU</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                    Deploy SSR pages, workflows, automations, and API gateway — no AI inference.
                </p>
            </button>
            <button
                type="button"
                onClick={() => selectComputeAndProceed('gpu')}
                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'gpu'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                    }`}
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <Brain className="w-5 h-5 text-purple-500 shrink-0" />
                    <span className="font-semibold text-sm">GPU</span>
                    <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-purple-500/10 text-purple-500 ml-auto sm:ml-0">AI</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                    Everything in CPU + AI model inference via Workers AI (LLMs, embeddings, vision…).
                </p>
            </button>
            {showCommunity && (
                <button
                    type="button"
                    onClick={() => selectComputeAndProceed('community')}
                    className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'community'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                        }`}
                >
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Globe className="w-5 h-5 text-emerald-500 shrink-0" />
                        <span className="font-semibold text-sm">Community</span>
                        <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-emerald-500/10 text-emerald-500 ml-auto sm:ml-0">SaaS</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                        Shared multi-tenant engine for *.frontbase.dev wildcard routing.
                    </p>
                </button>
            )}
        </div>
    );
}
