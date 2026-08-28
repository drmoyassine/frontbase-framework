/**
 * WordPress Import Summary Step Component
 *
 * This component displays the final import results and provides options
 * for next steps.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WordPressImportResult } from '@/types/wordpress';
import {
  CheckCircle,
  XCircle,
  Download,
  ExternalLink,
  FileText,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface WordPressSummaryStepProps {
  /** Import results */
  results: WordPressImportResult;
  /** Callback to restart the wizard */
  onRestart: () => void;
  /** Callback to close the wizard */
  onClose: () => void;
}

export const WordPressSummaryStep: React.FC<WordPressSummaryStepProps> = ({
  results,
  onRestart,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'urls'>('overview');

  const hasErrors = results.errors.length > 0;
  const isSuccess = results.status === 'completed' || results.status === 'partial';

  /**
   * Download URL mappings as CSV
   */
  const downloadUrlMappings = useCallback(() => {
    if (!results.urlMappings) return;

    const rows = Object.entries(results.urlMappings);
    const csv = ['Old URL,New URL', ...rows.map(([old, newUrl]) => `"${old}","${newUrl}"`)].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wordpress-url-mappings.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [results.urlMappings]);

  /**
   * Download import report
   */
  const downloadReport = useCallback(() => {
    const report = {
      import_id: results.importId,
      status: results.status,
      started_at: results.startedAt,
      completed_at: results.completedAt,
      duration_seconds: results.durationSeconds,
      total_records: results.totalRecords,
      successful: results.successful,
      failed: results.failed,
      post_types: results.postTypes,
      errors: results.errors,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordpress-import-${results.importId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const successRate = results.totalRecords > 0
    ? Math.round((results.successful / results.totalRecords) * 100)
    : 0;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          {isSuccess ? (
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          )}
          <div>
            <CardTitle>
              {isSuccess ? 'Import Completed Successfully' : 'Import Completed with Errors'}
            </CardTitle>
            <CardDescription>
              {results.successful} of {results.totalRecords} records imported successfully
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Success Metrics */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-green-600" />}
            label="Successful"
            value={results.successful}
          />
          <MetricCard
            icon={<XCircle className="w-5 h-5 text-red-600" />}
            label="Failed"
            value={results.failed}
          />
          <MetricCard
            icon={<Clock className="w-5 h-5 text-blue-600" />}
            label="Duration"
            value={`${results.durationSeconds.toFixed(1)}s`}
          />
          <MetricCard
            icon={<FileText className="w-5 h-5 text-purple-600" />}
            label="Success Rate"
            value={`${successRate}%`}
          />
        </div>

        {/* Tabs for detailed info */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {hasErrors && <TabsTrigger value="errors">Errors ({results.errors.length})</TabsTrigger>}
            {results.urlMappings && <TabsTrigger value="urls">URL Mappings</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Post Type Breakdown */}
            <div>
              <h3 className="font-medium mb-3">Import by Post Type</h3>
              <div className="border rounded-lg divide-y">
                {Object.entries(results.postTypes).map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium capitalize">{name}</div>
                      <div className="text-sm text-muted-foreground">
                        {data.imported} imported, {data.failed} failed
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{data.total} total</div>
                      <div className="text-xs text-muted-foreground">
                        {data.total > 0 ? Math.round((data.imported / data.total) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Import Options Used */}
            <div>
              <h3 className="font-medium mb-3">Import Options</h3>
              <div className="bg-muted rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <OptionLabel
                    label="Render Shortcodes"
                    value={results.options.renderShortcodes ? 'Yes' : 'No'}
                  />
                  <OptionLabel
                    label="Include Media"
                    value={results.options.includeMedia ? 'Yes' : 'No'}
                  />
                  <OptionLabel
                    label="Include Terms"
                    value={results.options.includeTerms ? 'Yes' : 'No'}
                  />
                  <OptionLabel
                    label="Include Author"
                    value={results.options.includeAuthor ? 'Yes' : 'No'}
                  />
                  <OptionLabel
                    label="Include ACF"
                    value={results.options.includeACF ? 'Yes' : 'No'}
                  />
                  <OptionLabel
                    label="Preserve IDs"
                    value={results.options.preserveIds ? 'Yes' : 'No'}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {hasErrors && (
            <TabsContent value="errors">
              <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                {results.errors.map((error, idx) => (
                  <div key={idx} className="p-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium">Record ID: {error.recordId}</div>
                        <div className="text-sm text-muted-foreground">
                          Post Type: {error.postType}
                        </div>
                        <div className="text-sm mt-1">{error.message}</div>
                        {error.details && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              View Details
                            </summary>
                            <pre className="text-xs bg-muted p-2 mt-2 rounded overflow-x-auto">
                              {JSON.stringify(error.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          {results.urlMappings && (
            <TabsContent value="urls">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(results.urlMappings).length} URL mappings generated
                  </p>
                  <Button size="sm" variant="outline" onClick={downloadUrlMappings}>
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="border rounded-lg divide-y max-h-96 overflow-y-auto text-sm">
                  {Object.entries(results.urlMappings).slice(0, 100).map(([oldUrl, newUrl]) => (
                    <div key={oldUrl} className="p-2 flex items-center gap-2">
                      <span className="text-muted-foreground truncate flex-1">{oldUrl}</span>
                      <span>→</span>
                      <span className="text-blue-600 truncate flex-1">{newUrl}</span>
                    </div>
                  ))}
                  {Object.keys(results.urlMappings).length > 100 && (
                    <div className="p-2 text-center text-muted-foreground text-xs">
                      ...and {Object.keys(results.urlMappings).length - 100} more
                    </div>
                  )}
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                    About URL Mappings
                  </p>
                  <p className="text-blue-700 dark:text-blue-300">
                    These mappings show your old WordPress URLs and their new Frontbase URLs.
                    You can use these to set up redirects or update internal links.
                  </p>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Download Report */}
        <div className="flex justify-center">
          <Button variant="outline" onClick={downloadReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Import Report
          </Button>
        </div>
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onRestart}>
          Import Another Site
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.location.href = '/content'}>
            <ExternalLink className="w-4 h-4 mr-2" />
            View Content
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value }) => {
  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

interface OptionLabelProps {
  label: string;
  value: string;
}

const OptionLabel: React.FC<OptionLabelProps> = ({ label, value }) => {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
    </div>
  );
};
