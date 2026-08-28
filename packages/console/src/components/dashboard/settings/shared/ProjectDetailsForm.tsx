/**
 * ProjectDetailsForm
 * 
 * Form component for project-level settings.
 * Uses AssetUploader for hybrid favicon upload (Supabase storage or URL fallback).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Loader2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { AssetUploader } from '@/components/shared/AssetUploader';

interface ProjectDetailsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

export function ProjectDetailsForm({ withCard = false }: ProjectDetailsFormProps) {
    const { project, updateProjectInDatabase, isProjectLoading } = useBuilderStore(useShallow(s => ({
        project: s.project,
        updateProjectInDatabase: s.updateProjectInDatabase,
        isProjectLoading: s.isProjectLoading
    })));

    const [formData, setFormData] = useState({
        name: '',
        appUrl: '',
        faviconUrl: '',
        logoUrl: '',
        description: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Track which fields have been modified by user to prevent race conditions
    const userModifiedFieldsRef = React.useRef<Set<string>>(new Set());

    // Sync form with project data - sync when project changes, but preserve user edits
    useEffect(() => {
        if (project) {
            setFormData(prev => ({
                // Only update fields that haven't been modified by the user
                name: userModifiedFieldsRef.current.has('name') ? prev.name : (project.name || ''),
                appUrl: userModifiedFieldsRef.current.has('appUrl') ? prev.appUrl : (project.appUrl || ''),
                faviconUrl: project.faviconUrl || '', // Always sync favicon (auto-saved)
                logoUrl: project.logoUrl || '', // Always sync logo (auto-saved)
                description: userModifiedFieldsRef.current.has('description') ? prev.description : (project.description || ''),
            }));
        }
    }, [project]); // Sync on any project update

    // Handle favicon URL changes from AssetUploader (auto-saved, no user tracking needed)
    const handleFaviconChange = async (url: string) => {
        setFormData(prev => ({ ...prev, faviconUrl: url }));

        // Auto-save to database
        try {
            await updateProjectInDatabase({ faviconUrl: url });
        } catch (error) {
            console.error('Failed to save favicon:', error);
        }
    };

    // Handle logo URL changes from AssetUploader (auto-saved, no user tracking needed)
    const handleLogoChange = async (url: string) => {
        setFormData(prev => ({ ...prev, logoUrl: url }));

        // Auto-save to database
        try {
            await updateProjectInDatabase({ logoUrl: url });
        } catch (error) {
            console.error('Failed to save logo:', error);
        }
    };

    // Handle text field changes with user modification tracking
    const handleFieldChange = (field: string, value: string) => {
        userModifiedFieldsRef.current.add(field);
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Only save the text fields - favicon and logo are auto-saved
            // This prevents accidentally overwriting them with stale state
            await updateProjectInDatabase({
                name: formData.name,
                appUrl: formData.appUrl || undefined,
                description: formData.description || undefined,
            });
            toast.success('Project settings saved');
            // Clear user modification tracking after successful save
            userModifiedFieldsRef.current.clear();
        } catch (error) {
            toast.error('Failed to save project settings');
        } finally {
            setIsSaving(false);
        }
    };

    const content = (
        <>
            <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                    id="project-name"
                    placeholder="My Website"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="app-url">App URL</Label>
                <Input
                    id="app-url"
                    placeholder="https://mysite.com"
                    value={formData.appUrl}
                    onChange={(e) => handleFieldChange('appUrl', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    Public URL for publish/preview. Leave empty to auto-detect.
                </p>
            </div>

            {/* Favicon & Logo Uploads */}
            <div className="grid grid-cols-2 gap-6">
                <AssetUploader
                    value={formData.faviconUrl}
                    onChange={handleFaviconChange}
                    assetType="favicon"
                    accept=".png,.ico,image/png,image/x-icon"
                    maxSize={256 * 1024}
                    label="Favicon"
                    helpText="PNG or ICO, max 256KB. Used in browser tabs."
                />
                <AssetUploader
                    value={formData.logoUrl}
                    onChange={handleLogoChange}
                    assetType="logo"
                    accept="image/*"
                    maxSize={1024 * 1024}
                    label="Logo"
                    helpText="PNG, SVG or JPG, max 1MB. Used for branding."
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="project-description">Project Description</Label>
                <Textarea
                    id="project-description"
                    placeholder="A description of your project..."
                    rows={2}
                    value={formData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                />
            </div>
            <div className="pt-2">
                <Button onClick={handleSave} disabled={isSaving || isProjectLoading}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Project Settings
                    </CardTitle>
                    <CardDescription>
                        Configure your project name, URL, favicon, and description
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {content}
                </CardContent>
            </Card>
        );
    }

    return <div className="space-y-4">{content}</div>;
}
