/**
 * FilePickerDialog - Dialog wrapper for FileBrowser in select mode
 * 
 * Opens a dialog to browse and select files from storage buckets.
 * Used by AssetUploader and other components that need file selection.
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { FileBrowser } from './index';
import { StorageFile } from './types';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import api from '@/services/api-service';

export interface FilePickerDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void;
    /** Callback when a file is selected - receives the public URL */
    onSelect: (url: string, file: StorageFile) => void;
    /** Optional: Storage provider ID (auto-detects first available if not set) */
    storageProviderId?: string;
    /** Optional: Initial bucket to navigate to */
    initialBucket?: string;
    /** Optional: File type filter (e.g., 'image' to only allow images) */
    fileFilter?: 'image' | 'all';
    /** Dialog title */
    title?: string;
    /** Dialog description */
    description?: string;
}

export function FilePickerDialog({
    open,
    onOpenChange,
    onSelect,
    storageProviderId,
    initialBucket,
    fileFilter = 'all',
    title = 'Select File',
    description = 'Browse your storage buckets to select a file.',
}: FilePickerDialogProps) {
    // If no storageProviderId provided, auto-detect the first one
    const { data: providers = [] } = useQuery({
        queryKey: ['storage-providers'],
        queryFn: async () => {
            const res = await api.get('/api/storage/providers/');
            return res.data;
        },
        enabled: open && !storageProviderId,
        staleTime: STALE.STANDARD,
    });

    const resolvedProviderId = storageProviderId || (providers.length > 0 ? providers[0].id : null);

    const handleFileSelect = (url: string, file: StorageFile) => {
        // If filtering for images, validate
        if (fileFilter === 'image') {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
            const ext = file.name.toLowerCase().split('.').pop() || '';
            if (!imageExtensions.includes(`.${ext}`)) {
                return; // Ignore non-image files
            }
        }

        onSelect(url, file);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto -mx-6 px-6">
                    {resolvedProviderId ? (
                        <FileBrowser
                            storageProviderId={resolvedProviderId}
                            selectMode={true}
                            onFileSelect={handleFileSelect}
                            initialBucket={initialBucket}
                        />
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No storage providers configured.</p>
                            <p className="text-sm mt-1">Add one in the Storage page first.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default FilePickerDialog;
