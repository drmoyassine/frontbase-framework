/**
 * WordPress Import Wizard - Main wizard component
 *
 * This component manages the multi-step WordPress import flow:
 * 1. Connect to WordPress site
 * 2. Discover data structure
 * 3. Map fields
 * 4. Execute import
 * 5. Review summary
 */

import React, { useState, useCallback } from 'react';
import { WordPressDiscovery, WordPressImportOptions, WordPressImportProgress, WordPressImportResult } from '@/types/wordpress';
import { WordPressConnectionStep } from './WordPressConnectionStep';
import { WordPressDiscoveryStep } from './WordPressDiscoveryStep';
import { WordPressMappingStep } from './WordPressMappingStep';
import { WordPressImportStep } from './WordPressImportStep';
import { WordPressSummaryStep } from './WordPressSummaryStep';

type WizardStep = 'connect' | 'discovery' | 'mapping' | 'import' | 'summary';

interface WordPressImportWizardProps {
  /** Frontbase project ID */
  projectId: string;
  /** Callback when import completes successfully */
  onComplete?: (results: WordPressImportResult) => void;
  /** Callback when wizard is cancelled */
  onCancel?: () => void;
}

/**
 * WordPress Import Wizard Component
 */
export const WordPressImportWizard: React.FC<WordPressImportWizardProps> = ({
  projectId,
  onComplete,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('connect');
  const [discovery, setDiscovery] = useState<WordPressDiscovery | null>(null);
  const [datasourceId, setDatasourceId] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState<WordPressImportOptions>({
    postTypes: [],
    fieldMappings: {},
    renderShortcodes: false,
    includeMedia: true,
    includeTerms: true,
    includeAuthor: true,
    includeACF: true,
    preserveIds: true,
    urlMapping: true,
    context: 'view',
  });
  const [progress, setProgress] = useState<WordPressImportProgress | null>(null);
  const [results, setResults] = useState<WordPressImportResult | null>(null);

  /**
   * Handle successful connection to WordPress
   */
  const handleConnectionSuccess = useCallback((dsId: string) => {
    setDatasourceId(dsId);
    setCurrentStep('discovery');
  }, []);

  /**
   * Handle completion of data discovery
   */
  const handleDiscoveryComplete = useCallback((discoveryData: WordPressDiscovery) => {
    setDiscovery(discoveryData);
    setCurrentStep('mapping');
  }, []);

  /**
   * Handle completion of field mapping
   */
  const handleMappingComplete = useCallback((options: WordPressImportOptions) => {
    setImportOptions(options);
    setCurrentStep('import');
  }, []);

  /**
   * Handle import progress updates
   */
  const handleImportProgress = useCallback((progressData: WordPressImportProgress) => {
    setProgress(progressData);
  }, []);

  /**
   * Handle completion of import
   */
  const handleImportComplete = useCallback((importResults: WordPressImportResult) => {
    setResults(importResults);
    setProgress(null);
    setCurrentStep('summary');
    onComplete?.(importResults);
  }, [onComplete]);

  /**
   * Handle restart of the wizard
   */
  const handleRestart = useCallback(() => {
    setResults(null);
    setProgress(null);
    setDiscovery(null);
    setDatasourceId(null);
    setImportOptions({
      postTypes: [],
      fieldMappings: {},
      renderShortcodes: false,
      includeMedia: true,
      includeTerms: true,
      includeAuthor: true,
      includeACF: true,
      preserveIds: true,
      urlMapping: true,
      context: 'view',
    });
    setCurrentStep('connect');
  }, []);

  /**
   * Handle back navigation
   */
  const handleBack = useCallback(() => {
    const steps: WizardStep[] = ['connect', 'discovery', 'mapping', 'import', 'summary'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);

  return (
    <div className="wordpress-import-wizard">
      {/* Wizard Header */}
      <div className="wizard-header">
        <h1 className="text-2xl font-bold">Import from WordPress</h1>
        <p className="text-muted-foreground mt-1">
          Connect your WordPress site and import content to Frontbase
        </p>

        {/* Step Indicators */}
        <div className="wizard-steps mt-6">
          <StepIndicator step="connect" current={currentStep} label="Connect" />
          <StepIndicator step="discovery" current={currentStep} label="Discover" />
          <StepIndicator step="mapping" current={currentStep} label="Map Fields" />
          <StepIndicator step="import" current={currentStep} label="Import" />
          <StepIndicator step="summary" current={currentStep} label="Summary" />
        </div>
      </div>

      {/* Wizard Content */}
      <div className="wizard-content mt-6">
        {currentStep === 'connect' && (
          <WordPressConnectionStep
            projectId={projectId}
            onSuccess={handleConnectionSuccess}
            onCancel={onCancel}
          />
        )}

        {currentStep === 'discovery' && datasourceId && !discovery && (
          <WordPressDiscoveryStep
            datasourceId={datasourceId}
            onComplete={handleDiscoveryComplete}
            onBack={handleBack}
          />
        )}

        {currentStep === 'mapping' && discovery && (
          <WordPressMappingStep
            discovery={discovery}
            initialOptions={importOptions}
            projectId={projectId}
            onComplete={handleMappingComplete}
            onBack={handleBack}
          />
        )}

        {currentStep === 'import' && discovery && (
          <WordPressImportStep
            datasourceId={datasourceId!}
            discovery={discovery}
            options={importOptions}
            onProgress={handleImportProgress}
            onComplete={handleImportComplete}
          />
        )}

        {currentStep === 'summary' && results && (
          <WordPressSummaryStep
            results={results}
            onRestart={handleRestart}
            onClose={onCancel}
          />
        )}
      </div>
    </div>
  );
};

interface StepIndicatorProps {
  step: WizardStep;
  current: WizardStep;
  label: string;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ step, current, label }) => {
  const steps: WizardStep[] = ['connect', 'discovery', 'mapping', 'import', 'summary'];
  const currentIndex = steps.indexOf(current);
  const stepIndex = steps.indexOf(step);

  const status = stepIndex < currentIndex ? 'completed' : stepIndex === currentIndex ? 'current' : 'pending';

  return (
    <div className={`step-indicator step-${status} flex items-center gap-2`}>
      <div className={`
        step-dot w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
        ${status === 'completed' ? 'bg-primary text-primary-foreground' : ''}
        ${status === 'current' ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : ''}
        ${status === 'pending' ? 'bg-muted text-muted-foreground' : ''}
      `}>
        {status === 'completed' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          stepIndex + 1
        )}
      </div>
      <span className={`step-label text-sm ${status === 'current' ? 'font-medium' : 'text-muted-foreground'}`}>
        {label}
      </span>
      {stepIndex < steps.length - 1 && (
        <div className={`flex-1 h-px mx-2 ${status === 'completed' ? 'bg-primary' : 'bg-muted'}`} />
      )}
    </div>
  );
};
