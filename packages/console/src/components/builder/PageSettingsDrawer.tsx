import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Settings,
    Palette,
    Zap,
    Eye,
    EyeOff,
    Package,
    Plus,
    Filter,
    Play,
    Home
} from 'lucide-react';
import type { Page, StylesData } from '@/types/builder';
import { StylesPanel } from '@/components/styles/StylesPanel';
import { getDefaultPageStyles } from '@/lib/styles/defaults';
import { VariableInput } from './VariableInput';
import { toast } from 'sonner';

// Allowed variable groups for SEO fields (exclude page to prevent circular dependency)
const SEO_ALLOWED_GROUPS = ['visitor', 'system', 'user', 'record'];

interface PageSettingsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const PageSettingsDrawer: React.FC<PageSettingsDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { currentPageId, pages, updatePage, savePageToDatabase } = useBuilderStore(useShallow(s => ({
        currentPageId: s.currentPageId,
        pages: s.pages,
        updatePage: s.updatePage,
        savePageToDatabase: s.savePageToDatabase
    })));
    const [activeTab, setActiveTab] = useState<string>('basic');
    const [isSaving, setIsSaving] = useState(false);
    const [showHomepageWarning, setShowHomepageWarning] = useState(false);
    const [pendingHomepageChange, setPendingHomepageChange] = useState(false);

    const currentPage = pages.find((p) => p.id === currentPageId);

    if (!currentPage) return null;

    // Convert old ContainerStyles to new StylesData if needed
    const getContainerStyles = (): StylesData => {
        if (!currentPage.containerStyles) {
            // No styles yet - use defaults  
            return getDefaultPageStyles();
        }

        // Check if it's already new format
        if ('activeProperties' in currentPage.containerStyles) {
            return currentPage.containerStyles as StylesData;
        }

        // Convert old format to new format
        const oldStyles = currentPage.containerStyles as any;
        const activeProperties: string[] = [];
        const values: Record<string, any> = {};

        if (oldStyles.orientation) {
            activeProperties.push('flexDirection');
            values.flexDirection = oldStyles.orientation;
        }
        if (oldStyles.gap !== undefined) {
            activeProperties.push('gap');
            values.gap = oldStyles.gap;
        }
        if (oldStyles.padding) {
            activeProperties.push('padding');
            values.padding = oldStyles.padding;
        }
        if (oldStyles.alignItems) {
            activeProperties.push('alignItems');
            values.alignItems = oldStyles.alignItems === 'start' ? 'flex-start' :
                oldStyles.alignItems === 'end' ? 'flex-end' : oldStyles.alignItems;
        }
        if (oldStyles.justifyContent) {
            activeProperties.push('justifyContent');
            values.justifyContent = oldStyles.justifyContent === 'start' ? 'flex-start' :
                oldStyles.justifyContent === 'end' ? 'flex-end' :
                    oldStyles.justifyContent === 'between' ? 'space-between' :
                        oldStyles.justifyContent === 'around' ? 'space-around' : oldStyles.justifyContent;
        }
        if (oldStyles.backgroundColor) {
            activeProperties.push('backgroundColor');
            values.backgroundColor = oldStyles.backgroundColor;
        }
        if (oldStyles.flexWrap) {
            activeProperties.push('flexWrap');
            values.flexWrap = oldStyles.flexWrap;
        }

        return {
            activeProperties,
            values,
            stylingMode: oldStyles.stylingMode || 'visual'
        };
    };

    const containerStyles = getContainerStyles();

    const handleUpdatePage = (updates: Partial<Page>) => {
        console.log('🔄 [PageSettings] handleUpdatePage called:', updates);
        if (currentPageId) {
            updatePage(currentPageId, updates);
            console.log('✅ [PageSettings] updatePage executed for ID:', currentPageId);
        } else {
            console.error('❌ [PageSettings] No currentPageId!');
        }
    };

    const handleStylesUpdate = (newStyles: StylesData) => {
        console.log('🎨 [PageSettings] handleStylesUpdate called:', newStyles);
        handleUpdatePage({ containerStyles: newStyles });
    };

    const handleSave = async () => {
        console.log('💾 [PageSettings] Save button clicked!');
        console.log('💾 [PageSettings] currentPageId:', currentPageId);
        console.log('💾 [PageSettings] savePageToDatabase:', savePageToDatabase);

        if (!currentPageId) {
            console.error('❌ [PageSettings] Cannot save: No currentPageId');
            toast.error('Error: No page selected');
            return;
        }

        setIsSaving(true);
        console.log('💾 [PageSettings] Calling savePageToDatabase...');

        try {
            await savePageToDatabase(currentPageId);
            console.log('✅ [PageSettings] Save successful!');
            onOpenChange(false);
        } catch (error) {
            console.error('❌ [PageSettings] Save failed:', error);
            toast.error('Failed to save page settings');
        } finally {
            setIsSaving(false);
            console.log('💾 [PageSettings] Save complete, isSaving reset');
        }
    };

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Page Settings
                        </SheetTitle>
                    </SheetHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-6">
                            <TabsTrigger value="basic" className="gap-2">
                                <Package className="h-4 w-4" />
                                Basic
                            </TabsTrigger>
                            <TabsTrigger value="styles" className="gap-2">
                                <Palette className="h-4 w-4" />
                                Styles
                            </TabsTrigger>
                            <TabsTrigger value="advanced" className="gap-2">
                                <Zap className="h-4 w-4" />
                                Advanced
                            </TabsTrigger>
                        </TabsList>

                        {/* BASIC TAB */}
                        <TabsContent value="basic" className="space-y-6">
                            {/* Page Name - Always visible */}
                            <div className="space-y-2">
                                <Label htmlFor="pageName">Page Name</Label>
                                <Input
                                    id="pageName"
                                    value={currentPage.name}
                                    onChange={(e) => handleUpdatePage({ name: e.target.value })}
                                    placeholder="Enter page name"
                                />
                            </div>

                            {/* Page Slug - Always visible */}
                            <div className="space-y-2">
                                <Label htmlFor="pageSlug">URL Slug</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">/</span>
                                    <Input
                                        id="pageSlug"
                                        value={currentPage.slug || ''}
                                        onChange={(e) => handleUpdatePage({ slug: e.target.value })}
                                        placeholder="page-slug"
                                        className="flex-1"
                                        disabled={currentPage.isHomepage}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {currentPage.isHomepage
                                        ? 'Homepage is served at "/"'
                                        : 'URL-friendly path (e.g., about-us, contact)'}
                                </p>
                            </div>

                            <Separator />

                            {/* Public Toggle - Always visible */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        {currentPage.isPublic ? (
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="text-sm font-medium">Public Page</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Make this page publicly accessible
                                    </p>
                                </div>
                                <Switch
                                    checked={currentPage.isPublic}
                                    onCheckedChange={(checked) => handleUpdatePage({ isPublic: checked })}
                                />
                            </div>

                            {/* SEO Fields - Only visible when Public is ON */}
                            {currentPage.isPublic && (
                                <>
                                    <Separator />

                                    {/* SEO Section Header */}
                                    <div className="text-sm font-medium text-muted-foreground">SEO Settings</div>

                                    {/* Page Title (SEO) */}
                                    <div className="space-y-2">
                                        <Label htmlFor="pageTitle">Page Title</Label>
                                        <VariableInput
                                            value={currentPage.title || ''}
                                            onChange={(value) => handleUpdatePage({ title: value })}
                                            placeholder="Page title for search engines"
                                            allowedGroups={SEO_ALLOWED_GROUPS}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {(currentPage.title || '').length}/60 characters recommended
                                        </p>
                                    </div>

                                    {/* Page Description (SEO) */}
                                    <div className="space-y-2">
                                        <Label htmlFor="pageDescription">Meta Description</Label>
                                        <VariableInput
                                            value={currentPage.description || ''}
                                            onChange={(value) => handleUpdatePage({ description: value })}
                                            placeholder="Brief description for search engines"
                                            multiline
                                            allowedGroups={SEO_ALLOWED_GROUPS}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {(currentPage.description || '').length}/160 characters recommended
                                        </p>
                                    </div>

                                    {/* Keywords */}
                                    <div className="space-y-2">
                                        <Label htmlFor="pageKeywords">Keywords</Label>
                                        <VariableInput
                                            value={currentPage.keywords || ''}
                                            onChange={(value) => handleUpdatePage({ keywords: value })}
                                            placeholder="keyword1, keyword2, keyword3"
                                            allowedGroups={SEO_ALLOWED_GROUPS}
                                        />
                                    </div>

                                    <Separator />

                                    {/* Homepage Toggle - Only visible when Public is ON */}
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <Home className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">Set as Homepage</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                This page will be served at "/"
                                            </p>
                                        </div>
                                        <Switch
                                            checked={currentPage.isHomepage}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    // Check if another page is already homepage
                                                    const existingHomepage = pages.find(p => p.isHomepage && p.id !== currentPageId);
                                                    if (existingHomepage) {
                                                        setPendingHomepageChange(true);
                                                        setShowHomepageWarning(true);
                                                        return;
                                                    }
                                                }
                                                handleUpdatePage({ isHomepage: checked });
                                            }}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Status Badge */}
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <div className="flex items-center gap-2">
                                    <Badge variant={currentPage.deletedAt ? 'destructive' : 'default'}>
                                        {currentPage.deletedAt ? 'Deleted' : 'Active'}
                                    </Badge>
                                    {currentPage.isHomepage && (
                                        <Badge variant="secondary">
                                            <Home className="h-3 w-3 mr-1" />
                                            Homepage
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* STYLES TAB */}
                        <TabsContent value="styles" className="space-y-6">
                            <StylesPanel
                                styles={containerStyles}
                                onUpdate={handleStylesUpdate}
                                title="Container Layout"
                            />
                        </TabsContent>

                        {/* ADVANCED TAB */}
                        <TabsContent value="advanced" className="space-y-6">
                            {/* Display Conditions - Placeholder */}
                            <div className="rounded-lg border border-border p-4 bg-muted/30">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Filter className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold">Display Conditions</h3>
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 p-3 rounded-md bg-background border border-dashed">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Not configured</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Control when this page is visible based on user conditions
                                </p>
                            </div>

                            <Separator />

                            {/* Page Load Actions - Placeholder */}
                            <div className="rounded-lg border border-border p-4 bg-muted/30">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Play className="h-4 w-4 text-muted-foreground" />
                                        <h3 className="font-semibold">Page Load Actions</h3>
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        Configure Action
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 p-3 rounded-md bg-background border border-dashed">
                                    <Play className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Not configured</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Run actions automatically when this page loads
                                </p>
                            </div>

                            <Separator />

                            {/* Page History - Placeholder */}
                            <div className="rounded-lg border border-border p-4 bg-muted/30">
                                <div className="flex items-center gap-2 mb-3">
                                    <h3 className="font-semibold">Page History</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Save current changes to activate
                                </p>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* Sticky Save/Close Buttons */}
                    <div className="sticky bottom-0 left-0 right-0 mt-6 pt-4 pb-4 px-6 bg-background border-t border-border flex gap-2">
                        <Button
                            onClick={() => onOpenChange(false)}
                            variant="outline"
                            className="flex-1"
                            disabled={isSaving}
                        >
                            Close
                        </Button>
                        <Button
                            onClick={handleSave}
                            className="flex-1"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Homepage Warning Dialog */}
            <AlertDialog open={showHomepageWarning} onOpenChange={setShowHomepageWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change Homepage?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {(() => {
                                const existingHomepage = pages.find(p => p.isHomepage && p.id !== currentPageId);
                                return existingHomepage
                                    ? `"${existingHomepage.name}" is currently set as the homepage. Setting "${currentPage.name}" as the homepage will remove the homepage status from "${existingHomepage.name}".`
                                    : 'Are you sure you want to set this page as the homepage?';
                            })()}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setShowHomepageWarning(false);
                            setPendingHomepageChange(false);
                        }}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            // Remove homepage from existing page
                            const existingHomepage = pages.find(p => p.isHomepage && p.id !== currentPageId);
                            if (existingHomepage) {
                                updatePage(existingHomepage.id, { isHomepage: false });
                            }
                            // Set current page as homepage
                            handleUpdatePage({ isHomepage: true });
                            setShowHomepageWarning(false);
                            setPendingHomepageChange(false);
                        }}>
                            Set as Homepage
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
