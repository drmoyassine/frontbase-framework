/**
 * FilePickerDialog - Dialog wrapper for FileBrowser in select mode
 * 
 * Opens a dialog to browse and select files from storage buckets.
 * Used by AssetUploader and other components that need file selection.
 */

import React, { useState } from 'react';
import { fetchBuckets } from './api';
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
    /** Resolve configured public URLs instead of temporary signed links. Does not change visibility. */
    requirePublicUrl?: boolean;
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
    requirePublicUrl = false,
    title = 'Select File',
    description = 'Browse your storage buckets to select a file.',
}: FilePickerDialogProps) {
    // If no storageProviderId provided, auto-detect the first one
    const [selectedProvider,setSelectedProvider]=useState('');
    const { data: providers = [], isPending: providersLoading, isError: providersError, refetch: retryProviders } = useQuery<{id:string;name:string}[]>({
        queryKey: ['storage-providers'],
        queryFn: async () => {
            const res = await api.get('/api/storage/providers/');
            return res.data;
        },
        enabled: open && !storageProviderId,
        staleTime: STALE.STANDARD,
    });

    const resolvedProviderId = storageProviderId || (providers.find(p=>p.id===selectedProvider)?.id ?? providers[0]?.id ?? null);
    const bucketsQuery=useQuery({queryKey:['storage-buckets',resolvedProviderId],queryFn:()=>fetchBuckets(resolvedProviderId!),enabled:open&&!!resolvedProviderId,staleTime:STALE.STANDARD});

    const handleFileSelect = (url: string, file: StorageFile) => {
        // If filtering for images, validate
        if (fileFilter === 'image') {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.avif'];
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
                {!storageProviderId&&providers.length>1&&<label className="text-sm">Storage connection<select aria-label="File picker storage connection" className="mt-1 w-full rounded border bg-background p-2" value={resolvedProviderId||''} onChange={e=>setSelectedProvider(e.target.value)}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                <div className="flex-1 overflow-auto -mx-6 px-6">
                    {resolvedProviderId ? (
                        <FileBrowser
                            key={resolvedProviderId}
                            storageProviderId={resolvedProviderId}
                            unifiedBuckets={bucketsQuery.data?.buckets.map(b=>({...b,providerId:resolvedProviderId}))||[]}
                            unifiedBucketsLoading={bucketsQuery.isPending}
                            unifiedBucketsError={bucketsQuery.isError?new Error('Storage buckets unavailable. Retry loading.'):null}
                            selectMode={true}
                            requirePublicUrl={requirePublicUrl}
                            onFileSelect={handleFileSelect}
                            initialBucket={initialBucket}
                        />
                    ) : providersError ? <div role="alert">Storage connections unavailable. <button type="button" onClick={()=>void retryProviders()}>Retry storage connections</button></div> : providersLoading ? <p role="status">Loading storage connections…</p> : (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No storage providers configured.</p>
                            <p className="text-sm mt-1">Add one in the Storage page first.</p>
                        </div>
                    )}
                </div>
                {resolvedProviderId&&bucketsQuery.isError&&<button type="button" onClick={()=>void bucketsQuery.refetch()}>Retry storage buckets</button>}
            </DialogContent>
        </Dialog>
    );
}

export default FilePickerDialog;
