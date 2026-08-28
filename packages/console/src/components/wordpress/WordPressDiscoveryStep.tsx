/**
 * WordPress Discovery Step Component
 *
 * This component displays the discovered WordPress data structure
 * and allows the user to review before proceeding to mapping.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WordPressDiscovery } from '@/types/wordpress';
import { Loader2, Database, FileText, Tag, Image } from 'lucide-react';

interface WordPressDiscoveryStepProps {
  /** Datasource ID */
  datasourceId: string;
  /** Callback when discovery completes */
  onComplete: (discovery: WordPressDiscovery) => void;
  /** Callback for back navigation */
  onBack: () => void;
}

export const WordPressDiscoveryStep: React.FC<WordPressDiscoveryStepProps> = ({
  datasourceId,
  onComplete,
  onBack,
}) => {
  const [discovery, setDiscovery] = useState<WordPressDiscovery | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch discovery data from the datasource
   */
  const fetchDiscovery = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sync/datasources/${datasourceId}/wordpress/discover/`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch discovery data');
      }

      const data = await response.json();
      setDiscovery(data);
    } catch (err: any) {
      setError(err.message || 'Failed to discover WordPress data');
    } finally {
      setIsLoading(false);
    }
  }, [datasourceId]);

  useEffect(() => {
    fetchDiscovery();
  }, [fetchDiscovery]);

  /**
   * Handle continue button
   */
  const handleContinue = useCallback(() => {
    if (discovery) {
      onComplete(discovery);
    }
  }, [discovery, onComplete]);

  /**
   * Retry discovery fetch
   */
  const handleRetry = useCallback(() => {
    fetchDiscovery();
  }, [fetchDiscovery]);

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Discovering WordPress data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Discovery Failed</CardTitle>
          <CardDescription>Could not discover WordPress data structure</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleRetry}>Retry</Button>
        </CardFooter>
      </Card>
    );
  }

  if (!discovery) {
    return null;
  }

  const postTypeCount = discovery.post_types.length;
  const taxonomyCount = discovery.taxonomies.length;
  const customTableCount = discovery.custom_tables.length;
  const acfEnabled = discovery.acf_field_groups.length > 0;
  const totalPosts = discovery.post_types.reduce((sum, pt) => sum + pt.count, 0);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>WordPress Data Discovered</CardTitle>
        <CardDescription>
          Review your WordPress site data structure before importing
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Site Info */}
        <div className="bg-muted rounded-lg p-4">
          <h3 className="font-medium mb-2">Site Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">URL:</span>
              <span className="ml-2">{discovery.site_info.url}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Name:</span>
              <span className="ml-2">{discovery.site_info.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">WordPress:</span>
              <span className="ml-2">{discovery.site_info.wp_version}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Language:</span>
              <span className="ml-2">{discovery.site_info.language}</span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            label="Post Types"
            value={postTypeCount}
          />
          <StatCard
            icon={<Tag className="w-5 h-5" />}
            label="Taxonomies"
            value={taxonomyCount}
          />
          <StatCard
            icon={<Database className="w-5 h-5" />}
            label="Custom Tables"
            value={customTableCount}
          />
          <StatCard
            icon={<Image className="w-5 h-5" />}
            label="Total Posts"
            value={totalPosts}
          />
        </div>

        {/* ACF Notice */}
        {acfEnabled && (
          <Alert>
            <AlertDescription>
              Advanced Custom Fields (ACF) detected. {discovery.acf_field_groups.length} field group(s) found.
              Structured ACF data will be available for import.
            </AlertDescription>
          </Alert>
        )}

        {/* Post Types List */}
        <div>
          <h3 className="font-medium mb-3">Post Types Found</h3>
          <div className="border rounded-lg divide-y">
            {discovery.post_types.map((pt) => (
              <div key={pt.name} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium">{pt.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {pt.name} • {pt.count} {pt.count === 1 ? 'post' : 'posts'}
                    {pt.custom_fields.length > 0 && ` • ${pt.custom_fields.length} custom fields`}
                  </div>
                </div>
                {pt.supports.includes('thumbnail') && (
                  <span className="text-xs bg-muted px-2 py-1 rounded">Featured Image</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Custom Tables Notice */}
        {customTableCount > 0 && (
          <Alert>
            <AlertDescription>
              {customTableCount} custom table(s) found (e.g., WooCommerce tables).
              Custom table migration will be available in a future update.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue}>
          Continue to Mapping
        </Button>
      </CardFooter>
    </Card>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value }) => {
  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};
