/**
 * AssetUploader Component
 * 
 * Smart upload component for branding assets (favicon, logo, etc.).
 * - If Supabase storage is connected: Upload to frontbase_assets bucket
 * - If no storage: Show URL input field for external URLs
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Upload, X, Image as ImageIcon, Loader2, Link as LinkIcon, Cloud, FolderOpen } from 'lucide-react';
import { useStorageEnabled, ASSETS_BUCKET } from '@/hooks/useStorageEnabled';
import { toast } from 'sonner';
import { FilePickerDialog } from '@/components/dashboard/FileBrowser/FilePickerDialog';

export interface AssetUploaderProps {
    /** Current URL value */
    value?: string;
    /** Callback when URL changes */
    onChange: (url: string) => void;
    /** Type of asset for path organization */
    assetType: 'favicon' | 'logo' | 'image';
    /** Accepted file types */
    accept?: string;
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Label text */
    label?: string;
    /** Help text */
    helpText?: string;
}

export function AssetUploader({
    value,
    onChange,
    assetType,
    accept = 'image/*',
    maxSize = 1024 * 1024, // 1MB default
    label = 'Image',
    helpText,
}: AssetUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { isStorageEnabled, checkBucket, createBucket, uploadAsset, isLoading } = useStorageEnabled();

    const [preview, setPreview] = useState<string | null>(value || null);
    const [urlInput, setUrlInput] = useState(value || '');
    const [isUploading, setIsUploading] = useState(false);
    const [showBucketDialog, setShowBucketDialog] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [showFilePicker, setShowFilePicker] = useState(false);

    // Sync preview with value changes
    useEffect(() => {
        if (value) {
            setPreview(value);
            setUrlInput(value);
        }
    }, [value]);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size
        if (file.size > maxSize) {
            toast.error(`File too large. Maximum size is ${Math.round(maxSize / 1024)}KB.`);
            return;
        }

        // If storage is not enabled, show error
        if (!isStorageEnabled) {
            toast.error('No storage connected. Please enter a URL instead.');
            return;
        }

        // Check if bucket exists
        setIsUploading(true);
        try {
            const bucketStatus = await checkBucket(ASSETS_BUCKET);

            if (!bucketStatus.exists) {
                // Store the file and show confirmation dialog
                setPendingFile(file);
                setShowBucketDialog(true);
                setIsUploading(false);
                return;
            }

            // Bucket exists, proceed with upload
            await uploadFile(file);
        } catch (error) {
            console.error('Error checking bucket:', error);
            toast.error('Failed to check storage. Please try again.');
        } finally {
            setIsUploading(false);
        }
    }, [isStorageEnabled, checkBucket, maxSize]);

    const uploadFile = async (file: File) => {
        setIsUploading(true);
        try {
            const filename = `${assetType}/${Date.now()}_${file.name}`;
            const result = await uploadAsset(file, filename);
            console.log('[AssetUploader] Upload result:', result);

            if ('url' in result) {
                console.log('[AssetUploader] Setting preview to:', result.url);
                setPreview(result.url);
                onChange(result.url);
                toast.success(`${label} uploaded successfully`);
            } else {
                toast.error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload file');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleCreateBucketAndUpload = async () => {
        if (!pendingFile) return;

        setIsUploading(true);
        try {
            const result = await createBucket(ASSETS_BUCKET, true);

            if (result.success) {
                toast.success('Storage bucket created');
                await uploadFile(pendingFile);
            } else {
                toast.error(result.error || 'Failed to create bucket');
            }
        } catch (error) {
            console.error('Bucket creation error:', error);
            toast.error('Failed to create storage bucket');
        } finally {
            setShowBucketDialog(false);
            setPendingFile(null);
            setIsUploading(false);
        }
    };

    const handleUrlSubmit = () => {
        if (urlInput.trim()) {
            setPreview(urlInput.trim());
            onChange(urlInput.trim());
            toast.success(`${label} URL saved`);
        }
    };

    const handleRemove = () => {
        setPreview(null);
        setUrlInput('');
        onChange('');
    };

    const handleFilePick = (url: string) => {
        setPreview(url);
        setUrlInput(url);
        onChange(url);
        toast.success(`${label} selected`);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const loading = isUploading || isLoading;

    return (
        <div className="space-y-2">
            {label && <Label>{label}</Label>}

            <div className="flex items-center gap-4">
                {/* Preview */}
                {preview ? (
                    <div className="relative">
                        <img
                            src={preview}
                            alt={`${label} preview`}
                            className="w-12 h-12 rounded border border-border object-contain bg-muted"
                            onError={() => setPreview(null)}
                        />
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="absolute -top-2 -right-2 p-0.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ) : (
                    <div className="w-12 h-12 rounded border border-dashed border-border flex items-center justify-center bg-muted/50">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                )}

                <div className="flex-1 space-y-2">
                    {isStorageEnabled ? (
                        /* Storage connected: Show browse button */
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setShowFilePicker(true)}
                                disabled={loading}
                                title="Browse & Upload"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <FolderOpen className="h-4 w-4" />
                                )}
                            </Button>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Cloud className="h-3 w-3" />
                                Select or upload to Supabase Storage
                            </p>
                        </>
                    ) : (
                        /* No storage: Show URL input */
                        <div className="flex gap-2">
                            <Input
                                placeholder="https://example.com/image.png"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleUrlSubmit}
                                disabled={!urlInput.trim()}
                            >
                                <LinkIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {helpText && (
                <p className="text-xs text-muted-foreground">{helpText}</p>
            )}

            {/* Bucket Creation Confirmation Dialog */}
            <Dialog open={showBucketDialog} onOpenChange={setShowBucketDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Storage Bucket</DialogTitle>
                        <DialogDescription>
                            The <code className="bg-muted px-1 rounded">frontbase_assets</code> bucket
                            doesn't exist yet. Would you like to create it?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            This will create a public bucket in your Supabase project
                            for storing branding assets like favicons and logos.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowBucketDialog(false);
                                setPendingFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateBucketAndUpload}
                            disabled={loading}
                        >
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create & Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* File Picker Dialog */}
            <FilePickerDialog
                open={showFilePicker}
                onOpenChange={setShowFilePicker}
                onSelect={(url) => handleFilePick(url)}
                initialBucket={ASSETS_BUCKET}
                fileFilter="image"
                title="Select Image"
                description={`Browse your storage to select an existing ${assetType}.`}
            />
        </div>
    );
}
