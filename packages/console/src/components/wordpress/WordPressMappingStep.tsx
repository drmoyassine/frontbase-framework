/**
 * WordPress Mapping Step Component
 *
 * This component allows users to:
 * 1. Select which post types to import
 * 2. Configure field mappings
 * 3. Set import options
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { WordPressDiscovery, WordPressImportOptions, WordPressPostType } from '@/types/wordpress';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';

interface WordPressMappingStepProps {
  /** Discovery data */
  discovery: WordPressDiscovery;
  /** Initial import options */
  initialOptions: WordPressImportOptions;
  /** Frontbase project ID */
  projectId: string;
  /** Callback when mapping completes */
  onComplete: (options: WordPressImportOptions) => void;
  /** Callback for back navigation */
  onBack: () => void;
}

interface PostTypeMappingState {
  postType: string;
  selected: boolean;
  expanded: boolean;
  fieldMappings: Record<string, string>;
}

export const WordPressMappingStep: React.FC<WordPressMappingStepProps> = ({
  discovery,
  initialOptions,
  projectId,
  onComplete,
  onBack,
}) => {
  const [postTypeMappings, setPostTypeMappings] = useState<PostTypeMappingState[]>(
    discovery.post_types.map((pt) => ({
      postType: pt.name,
      selected: pt.name === 'post' || pt.name === 'page', // Default to posts and pages
      expanded: false,
      fieldMappings: generateDefaultMappings(pt),
    }))
  );

  const [options, setOptions] = useState({
    renderShortcodes: initialOptions.renderShortcodes,
    includeMedia: initialOptions.includeMedia,
    includeTerms: initialOptions.includeTerms,
    includeAuthor: initialOptions.includeAuthor,
    includeACF: initialOptions.includeACF && discovery.acf_field_groups.length > 0,
    preserveIds: initialOptions.preserveIds,
    urlMapping: initialOptions.urlMapping,
    context: initialOptions.context as 'view' | 'edit',
  });

  /**
   * Toggle post type selection
   */
  const togglePostType = useCallback((postType: string) => {
    setPostTypeMappings((prev) =>
      prev.map((ptm) =>
        ptm.postType === postType ? { ...ptm, selected: !ptm.selected } : ptm
      )
    );
  }, []);

  /**
   * Toggle post type expansion
   */
  const toggleExpand = useCallback((postType: string) => {
    setPostTypeMappings((prev) =>
      prev.map((ptm) =>
        ptm.postType === postType ? { ...ptm, expanded: !ptm.expanded } : ptm
      )
    );
  }, []);

  /**
   * Update field mapping
   */
  const updateFieldMapping = useCallback((postType: string, fbField: string, wpPath: string) => {
    setPostTypeMappings((prev) =>
      prev.map((ptm) => {
        if (ptm.postType !== postType) return ptm;
        return {
          ...ptm,
          fieldMappings: { ...ptm.fieldMappings, [fbField]: wpPath },
        };
      })
    );
  }, []);

  /**
   * Handle continue
   */
  const handleContinue = useCallback(() => {
    const selectedPostTypes = postTypeMappings
      .filter((ptm) => ptm.selected)
      .map((ptm) => ptm.postType);

    const fieldMappings: Record<string, Record<string, string>> = {};
    postTypeMappings.forEach((ptm) => {
      if (ptm.selected) {
        fieldMappings[ptm.postType] = ptm.fieldMappings;
      }
    });

    onComplete({
      postTypes: selectedPostTypes,
      fieldMappings,
      ...options,
    });
  }, [postTypeMappings, options, onComplete]);

  const selectedCount = postTypeMappings.filter((ptm) => ptm.selected).length;
  const canContinue = selectedCount > 0;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Map WordPress Fields</CardTitle>
        <CardDescription>
          Select post types to import and configure field mappings
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Import Options */}
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4" />
            <h3 className="font-medium">Import Options</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OptionSwitch
              label="Render Shortcodes"
              description="Convert shortcodes to HTML during import"
              checked={options.renderShortcodes}
              onChange={(checked) => setOptions((prev) => ({ ...prev, renderShortcodes: checked }))}
            />
            <OptionSwitch
              label="Include Media"
              description="Import featured images and media attachments"
              checked={options.includeMedia}
              onChange={(checked) => setOptions((prev) => ({ ...prev, includeMedia: checked }))}
            />
            <OptionSwitch
              label="Include Terms"
              description="Import taxonomy terms (categories, tags)"
              checked={options.includeTerms}
              onChange={(checked) => setOptions((prev) => ({ ...prev, includeTerms: checked }))}
            />
            <OptionSwitch
              label="Include Author"
              description="Import author information"
              checked={options.includeAuthor}
              onChange={(checked) => setOptions((prev) => ({ ...prev, includeAuthor: checked }))}
            />
            {discovery.acf_field_groups.length > 0 && (
              <OptionSwitch
                label="Include ACF Data"
                description="Import structured Advanced Custom Fields data"
                checked={options.includeACF}
                onChange={(checked) => setOptions((prev) => ({ ...prev, includeACF: checked }))}
              />
            )}
            <OptionSwitch
              label="Preserve IDs"
              description="Keep WordPress post IDs in Frontbase"
              checked={options.preserveIds}
              onChange={(checked) => setOptions((prev) => ({ ...prev, preserveIds: checked }))}
            />
            <OptionSwitch
              label="URL Mapping"
              description="Generate URL mapping for redirects"
              checked={options.urlMapping}
              onChange={(checked) => setOptions((prev) => ({ ...prev, urlMapping: checked }))}
            />
            <OptionSwitch
              label="Import Drafts"
              description="Include draft and private posts"
              checked={options.context === 'edit'}
              onChange={(checked) =>
                setOptions((prev) => ({ ...prev, context: checked ? 'edit' : 'view' }))
              }
            />
          </div>
        </div>

        {/* Post Type Selection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Post Types to Import</h3>
            <span className="text-sm text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>
          <div className="border rounded-lg divide-y">
            {postTypeMappings.map((ptm) => {
              const postType = discovery.post_types.find((pt) => pt.name === ptm.postType);
              if (!postType) return null;

              return (
                <div key={ptm.postType} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`pt-${ptm.postType}`}
                        checked={ptm.selected}
                        onCheckedChange={() => togglePostType(ptm.postType)}
                      />
                      <Label
                        htmlFor={`pt-${ptm.postType}`}
                        className="cursor-pointer"
                      >
                        <div className="font-medium">{postType.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {postType.count} {postType.count === 1 ? 'post' : 'posts'} •{' '}
                          {postType.custom_fields.length} custom fields
                        </div>
                      </Label>
                    </div>
                    {postType.custom_fields.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(ptm.postType)}
                      >
                        {ptm.expanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Field Mappings (when expanded) */}
                  {ptm.expanded && (
                    <div className="mt-4 pl-11 space-y-2">
                      {postType.custom_fields.map((field) => (
                        <div key={field.meta_key} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground w-32 truncate">
                            {field.meta_key}
                          </span>
                          <span>→</span>
                          <span className="font-medium">
                            {sanitizeFieldName(field.meta_key)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({field.type})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Alert */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
            Field Mappings
          </p>
          <p className="text-blue-700 dark:text-blue-300">
            Core WordPress fields (title, content, status, etc.) are automatically mapped.
            Custom fields will be mapped to corresponding Frontbase fields with sanitized names.
            You can review and adjust mappings after import.
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue} disabled={!canContinue}>
          Start Import ({selectedCount} post types)
        </Button>
      </CardFooter>
    </Card>
  );
};

/**
 * Option Switch Component
 */
interface OptionSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const OptionSwitch: React.FC<OptionSwitchProps> = ({
  label,
  description,
  checked,
  onChange,
}) => {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="space-y-1">
        <Label className="font-medium">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

/**
 * Generate default field mappings for a post type
 */
function generateDefaultMappings(postType: WordPressPostType): Record<string, string> {
  const mappings: Record<string, string> = {
    // Core WordPress fields
    wordpress_id: 'id',
    title: 'title',
    content: 'content',
    excerpt: 'excerpt',
    slug: 'slug',
    status: 'status',
    published_at: 'date',
    modified_at: 'modified',
    permalink: 'permalink',
  };

  // Custom fields
  for (const field of postType.custom_fields) {
    const fbName = sanitizeFieldName(field.meta_key);
    mappings[fbName] = `meta.${field.meta_key}`;
  }

  return mappings;
}

/**
 * Sanitize WordPress field name for Frontbase
 */
function sanitizeFieldName(name: string): string {
  // Remove common prefixes
  for (const prefix of ['_', 'acf_', 'field_']) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  // Replace hyphens with underscores
  return name.replace(/-/g, '_').toLowerCase();
}
