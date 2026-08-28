/**
 * WordPress Import Step Component
 *
 * This component executes the import and displays progress.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WordPressDiscovery, WordPressImportOptions, WordPressImportProgress } from '@/types/wordpress';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface WordPressImportStepProps {
  /** Datasource ID */
  datasourceId: string;
  /** Discovery data */
  discovery: WordPressDiscovery;
  /** Import options */
  options: WordPressImportOptions;
  /** Callback for progress updates */
  onProgress: (progress: WordPressImportProgress) => void;
  /** Callback when import completes */
  onComplete: (results: any) => void;
}

export const WordPressImportStep: React.FC<WordPressImportStepProps> = ({
  datasourceId,
  discovery,
  options,
  onProgress,
  onComplete,
}) => {
  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState<WordPressImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * Start the import process
   */
  const startImport = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      abortControllerRef.current = new AbortController();

      // Start the import (sync sub-app is mounted at /api/sync)
      const response = await fetch('/api/sync/wordpress/import/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasource_id: datasourceId,
          options,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      const { import_id } = await response.json();
      setImportId(import_id);

      // Connect to SSE for progress updates
      connectToProgressStream(import_id);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Import was cancelled');
      } else {
        setError(err.message || 'Failed to start import');
      }
      setIsStarting(false);
    }
  }, [datasourceId, options]);

  /**
   * Connect to SSE progress stream
   */
  const connectToProgressStream = useCallback((importId: string) => {
    const eventSource = new EventSource(`/api/sync/wordpress/import/${importId}/progress/`, {
      withCredentials: true,
    });
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      const progressData = JSON.parse(e.data);
      setProgress(progressData);
      onProgress(progressData);
    });

    eventSource.addEventListener('complete', (e) => {
      const results = JSON.parse(e.data);
      setProgress((prev) => ({ ...prev, status: 'completed', completedAt: results.completedAt }));
      onComplete(results);

      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.addEventListener('error', (e) => {
      setError('Connection to import stream lost');
      eventSource.close();
      eventSourceRef.current = null;
      setIsStarting(false);
    });

    setIsStarting(false);
  }, [onComplete]);

  /**
   * Cancel the import
   */
  const cancelImport = useCallback(() => {
    abortControllerRef.current?.abort();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStarting(false);
    setProgress(null);
  }, []);

  // Auto-start import when component mounts
  useEffect(() => {
    startImport();

    return () => {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.close();
    };
  }, []);

  const currentStatus = progress?.status || 'running';
  const percentComplete = progress
    ? Math.round((progress.processedRecords / progress.totalRecords) * 100)
    : 0;

  const selectedPostTypes = options.postTypes;
  const totalRecords = selectedPostTypes.reduce((sum, ptName) => {
    const pt = discovery.post_types.find((p) => p.name === ptName);
    return sum + (pt?.count || 0);
  }, 0);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Importing from WordPress</CardTitle>
        <CardDescription>
          {isStarting
            ? 'Starting import...'
            : currentStatus === 'completed'
            ? 'Import completed!'
            : 'Import is in progress...'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <XCircle className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Import Error</p>
              <p className="text-sm text-destructive/80">{error}</p>
            </div>
          </div>
        )}

        {/* Progress Overview */}
        {progress && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">
                  {progress.processedRecords} / {progress.totalRecords} records
                </span>
              </div>
              <Progress value={percentComplete} className="h-2" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{percentComplete}%</span>
                {progress.currentPostType && (
                  <span>Currently: {progress.currentPostType}</span>
                )}
              </div>
            </div>

            {/* Status Indicators */}
            <div className="grid grid-cols-3 gap-4">
              <StatusCard
                icon={<CheckCircle className="w-5 h-5" />}
                label="Successful"
                value={progress.processedRecords - progress.failedRecords}
                variant="success"
              />
              <StatusCard
                icon={<XCircle className="w-5 h-5" />}
                label="Failed"
                value={progress.failedRecords}
                variant={progress.failedRecords > 0 ? 'error' : 'default'}
              />
              <StatusCard
                icon={<AlertCircle className="w-5 h-5" />}
                label="Remaining"
                value={progress.totalRecords - progress.processedRecords}
                variant="default"
              />
            </div>

            {/* Current Post Type Progress */}
            {progress.currentPage && progress.totalPages && (
              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm">
                  <span className="font-medium">Page {progress.currentPage} of {progress.totalPages}</span>
                  {progress.currentPostType && (
                    <span className="text-muted-foreground ml-2">
                      ({progress.currentPostType})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Initial Loading */}
        {isStarting && !progress && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Starting import...</p>
          </div>
        )}

        {/* Import Summary */}
        {!isStarting && (
          <div className="bg-muted rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">Import Summary</p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>Post types:</span>
              <span>{selectedPostTypes.length}</span>
              <span>Total records:</span>
              <span>{totalRecords}</span>
              <span>Render shortcodes:</span>
              <span>{options.renderShortcodes ? 'Yes' : 'No'}</span>
              <span>Include media:</span>
              <span>{options.includeMedia ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        {currentStatus !== 'completed' && !error && (
          <Button variant="outline" onClick={cancelImport}>
            Cancel Import
          </Button>
        )}
        {currentStatus === 'completed' && (
          <Button onClick={() => window.location.reload()}>
            View Imported Content
          </Button>
        )}
        {error && (
          <Button onClick={startImport}>Retry Import</Button>
        )}
      </CardFooter>
    </Card>
  );
};

interface StatusCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant: 'success' | 'error' | 'default';
}

const StatusCard: React.FC<StatusCardProps> = ({ icon, label, value, variant }) => {
  const colors = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    default: 'text-muted-foreground',
  };

  return (
    <div className="bg-muted rounded-lg p-3">
      <div className={`flex items-center gap-2 ${colors[variant]}`}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
};
