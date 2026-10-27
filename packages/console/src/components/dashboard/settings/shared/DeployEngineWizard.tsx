/**
 * DeployEngineWizard — Unified deploy wizard with CPU / GPU flow.
 *
 * Steps:
 *   1. Provider  — select CF provider account
 *   2. Compute   — CPU vs GPU toggle cards
 *   3. Config    — Lite/Full, worker name, DB, cache, queue
 *   4. AI Model  — GPU only: search + select from Workers AI catalog
 *   5. Deploying — spinner while deploy is in progress
 *
 * Architecture:
 *   - useDeployWizard.ts   — All state, navigation, and deploy logic
 *   - WizardProviderStep   — Step 1 UI
 *   - WizardComputeStep    — Step 2 UI
 *   - WizardConfigStep     — Step 3 UI (main per-provider customization point)
 *   - WizardAIModelStep    — Step 4 UI
 */

import { Rocket, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { useDeployWizard } from './deploy-wizard/useDeployWizard';
import { WizardProviderStep } from './deploy-wizard/WizardProviderStep';
import { WizardComputeStep } from './deploy-wizard/WizardComputeStep';
import { WizardConfigStep } from './deploy-wizard/WizardConfigStep';
import { WizardAIModelStep } from './deploy-wizard/WizardAIModelStep';

// ============================================================================
// Component
// ============================================================================

export function DeployEngineWizard() {
    const wizard = useDeployWizard();

    const {
        open, handleOpenChange,
        step, error, isDeploying,
        goNext, goBack, canNext, stepTitle, stepNumber,
        computeType, selectedModels,
        selectedProvider, selectedProviderType,
    } = wizard;

    return (
        <>
            {/* Deploy Engine trigger button — always active */}
            <Button size="sm" onClick={() => handleOpenChange(true)}>
                <Rocket className="w-4 h-4 mr-2" /> Deploy Engine
            </Button>

            {/* Main deploy wizard dialog */}
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-[680px]">
                    <DialogHeader>
                        <DialogTitle>{stepTitle()}</DialogTitle>
                        <DialogDescription>
                            {step === 'deploying'
                                ? 'Please wait while your engine is being deployed...'
                                : stepNumber()
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4 min-h-[200px]">
                        {error && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {step === 'compute-type' && <WizardComputeStep {...wizard} />}
                        {step === 'provider' && <WizardProviderStep {...wizard} />}
                        {step === 'engine-config' && <WizardConfigStep {...wizard} />}
                        {step === 'ai-model' && <WizardAIModelStep {...wizard} />}

                        {step === 'deploying' && (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    Deploying engine to {selectedProvider?.name || selectedProviderType}...
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ─── Footer: Back / Next / Deploy ───────── */}
                    {step !== 'deploying' && (
                        <DialogFooter className="flex justify-between sm:justify-between">
                            <div>
                                {step !== 'compute-type' && (
                                    <Button variant="outline" onClick={goBack} size="sm">
                                        <ChevronLeft className="w-4 h-4 mr-1" /> Back
                                    </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => handleOpenChange(false)} size="sm">Cancel</Button>
                                <Button
                                    onClick={goNext}
                                    disabled={!canNext() || isDeploying}
                                    size="sm"
                                >
                                    {step === 'engine-config' && computeType === 'cpu' ? (
                                        <><Rocket className="w-4 h-4 mr-1" /> Deploy</>
                                    ) : step === 'ai-model' ? (
                                        <><Rocket className="w-4 h-4 mr-1" /> {selectedModels.length > 0 ? `Deploy with ${selectedModels.length} Model${selectedModels.length > 1 ? 's' : ''}` : 'Deploy without Model'}</>
                                    ) : (
                                        <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

