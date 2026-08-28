// FileBrowser — Thin orchestrator
// Owns shared state (hooks) and delegates rendering to BucketListView / FileListView

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { StorageFile, Bucket } from './types';
import { useFileBrowserState } from './hooks/useFileBrowserState';
import { useStorageMutations } from './hooks/useStorageMutations';
import { BucketListView, StorageProviderInfo } from './BucketListView';
import { FileListView } from './FileListView';

// Types
interface FileBrowserProps {
    /** Required — the StorageProvider ID to scope file operations */
    storageProviderId: string;
    onNavigationChange?: (isBrowsing: boolean) => void;
    /** When true, clicking a file calls onFileSelect instead of opening */
    selectMode?: boolean;
    /** Callback when a file is selected (selectMode must be true) */
    onFileSelect?: (url: string, file: StorageFile) => void;
    /** Auto-navigate to this bucket on mount */
    initialBucket?: string;
    /** Hide bucket list and only show files */
    hideBucketList?: boolean;
    // ── Unified multi-provider mode props ──
    /** Pre-merged buckets from all providers */
    unifiedBuckets?: Bucket[];
    /** Whether unified bucket data is still loading */
    unifiedBucketsLoading?: boolean;
    /** Error from fetching unified buckets */
    unifiedBucketsError?: Error | null;
    /** Permission warnings keyed by provider ID */
    permissionWarnings?: Record<string, string>;
    /** Available providers for the filter dropdown */
    availableProviders?: { label: string; value: string }[];
    /** Connected storage providers for the bucket create dialog */
    connectedProviders?: StorageProviderInfo[];
}

export function FileBrowser({
    storageProviderId,
    onNavigationChange,
    selectMode = false,
    onFileSelect,
    initialBucket,
    hideBucketList = false,
    unifiedBuckets,
    unifiedBucketsLoading,
    unifiedBucketsError,
    permissionWarnings,
    availableProviders,
    connectedProviders,
}: FileBrowserProps) {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    // ── Shared state hook ──
    const state = useFileBrowserState();
    const {
        currentBucket, setCurrentBucket, currentPath, setCurrentPath, page, setPage,
        sortConfig, handleSort, getSortedFiles,
        isBucketDialogOpen, setIsBucketDialogOpen, bucketDialogMode, editingBucketId, bucketForm, setBucketForm,
        handleOpenCreateBucket, handleOpenEditBucket, editingBucketProvider,
        confirmDialog, setConfirmDialog,
        isFolderDialogOpen, setIsFolderDialogOpen, newFolderName, setNewFolderName,
        isRenameDialogOpen, setIsRenameDialogOpen, renameTarget, newName, setNewName, handleRename,
        bucketSearch, setBucketSearch, fileSearch, setFileSearch,
        selectedFiles, setSelectedFiles, handleSelectAll, handleSelectFile,
        selectedProviders, setSelectedProviders, bucketSortConfig, setBucketSortConfig, bucketPage, setBucketPage,
        getFilteredAndSortedBuckets, getPaginatedBuckets, getTotalBucketPages,
        isMoveDialogOpen, setIsMoveDialogOpen, moveTargets, setMoveTargets, moveDestBucket, setMoveDestBucket, moveDestPath, setMoveDestPath, handleMove,
        handleBucketClick, handleBack,
    } = state;

    // Track the active provider for the selected bucket (for file operations)
    const [activeBucketProviderId, setActiveBucketProviderId] = React.useState<string>(storageProviderId);

    // Override handleBucketClick to track the provider
    const handleBucketClickWithProvider = React.useCallback((bucket: Bucket) => {
        if (bucket.providerId) {
            setActiveBucketProviderId(bucket.providerId);
        }
        handleBucketClick(bucket);
    }, [handleBucketClick]);

    // Reset active provider when going back to bucket list
    const handleBackWithProvider = React.useCallback(() => {
        handleBack();
        if (!currentPath) {
            // Going back to bucket list
            setActiveBucketProviderId(storageProviderId);
        }
    }, [handleBack, currentPath, storageProviderId]);

    // The effective provider ID for file operations
    const effectiveProviderId = activeBucketProviderId || storageProviderId;

    // ── Shared mutations hook ──
    const mutations = useStorageMutations({
        storageProviderId: effectiveProviderId,
        currentBucket,
        currentPath,
        editingBucketId,
        setIsBucketDialogOpen,
        setIsFolderDialogOpen,
        setNewFolderName,
        setIsRenameDialogOpen,
        setRenameTarget: state.setRenameTarget,
        setNewName,
        setIsMoveDialogOpen,
        setMoveTargets,
        setSelectedFiles,
        setConfirmDialog,
        setCurrentBucket,
    });
    const {
        createBucketMutation, updateBucketMutation, deleteBucketMutation, emptyBucketMutation,
        deleteMutation, uploadMutation, createFolderMutation, renameMutation, moveMutation,
    } = mutations;

    // ── Effects ──
    React.useEffect(() => {
        onNavigationChange?.(!!currentBucket);
    }, [currentBucket, onNavigationChange]);

    React.useEffect(() => {
        if (initialBucket && !currentBucket) {
            setCurrentBucket(initialBucket);
        }
    }, [initialBucket]);

    // ── Shared handlers ──
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['storage-buckets'] }),
                currentBucket
                    ? queryClient.invalidateQueries({ queryKey: ['storage-files', effectiveProviderId] })
                    : Promise.resolve(),
                new Promise(resolve => setTimeout(resolve, 500)),
            ]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleConfirmAction = () => {
        if (!confirmDialog.actionType) return;
        if (confirmDialog.actionType === 'delete') {
            if (selectedFiles.size > 0 && !confirmDialog.targetId) {
                const paths = Array.from(selectedFiles).map((name) => (currentPath ? `${currentPath}/${name}` : name));
                deleteMutation.mutate(paths);
                setSelectedFiles(new Set());
            } else if (confirmDialog.targetId) {
                deleteMutation.mutate([confirmDialog.targetId]);
            }
        } else if (confirmDialog.actionType === 'empty' && confirmDialog.targetId) {
            // Look up the bucket to get its provider ID
            const targetBucket = unifiedBuckets?.find(b => b.id === confirmDialog.targetId || b.name === confirmDialog.targetId);
            emptyBucketMutation.mutate({ id: confirmDialog.targetId, providerId: targetBucket?.providerId });
        } else if (confirmDialog.actionType === 'deleteBucket' && confirmDialog.targetId) {
            // Look up the bucket to get its provider ID
            const targetBucket = unifiedBuckets?.find(b => b.id === confirmDialog.targetId || b.name === confirmDialog.targetId);
            deleteBucketMutation.mutate({ id: confirmDialog.targetId, providerId: targetBucket?.providerId });
            // Reset to page 1 so the user doesn't get stuck on an empty page
            setBucketPage(1);
        }
    };

    const handleBucketSubmit = (selectedProviderId?: string, projectId?: string) => {
        const fileSize = bucketForm.fileSizeLimit ? parseFloat(bucketForm.fileSizeLimit) * 1024 * 1024 : undefined;
        const mimeTypes = bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        if (bucketDialogMode === 'create') {
            createBucketMutation.mutate({
                name: bucketForm.name,
                public: bucketForm.public,
                fileSizeLimit: fileSize,
                allowedMimeTypes: mimeTypes,
                _providerId: selectedProviderId,
                projectId,
            });
        } else {
            updateBucketMutation.mutate({
                id: editingBucketId,
                public: bucketForm.public,
                fileSizeLimit: fileSize,
                allowedMimeTypes: mimeTypes,
                _providerId: editingBucketProvider?.id,
            });
        }
    };

    const handleCreateFolder = () => {
        if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
    };

    const handleRenameSubmit = () => {
        if (renameTarget && newName.trim() && newName !== renameTarget.name) {
            renameMutation.mutate({ oldName: renameTarget.name, newName: newName.trim() });
        }
    };

    const handleMoveSubmit = () => {
        if (moveDestBucket && moveTargets.length > 0) {
            moveMutation.mutate({ targets: moveTargets, destBucket: moveDestBucket, destPath: moveDestPath, sourceBucket: currentBucket! });
        }
    };

    const bucketMutationPending = createBucketMutation.isPending || updateBucketMutation.isPending;

    // =========================================================================
    // RENDER
    // =========================================================================
    if (!currentBucket) {
        return (
            <BucketListView
                storageProviderId={effectiveProviderId}
                buckets={unifiedBuckets}
                bucketsLoading={unifiedBucketsLoading}
                bucketsError={unifiedBucketsError}
                permissionWarnings={permissionWarnings}
                availableProviders={availableProviders}
                connectedProviders={connectedProviders}
                bucketSearch={bucketSearch}
                setBucketSearch={setBucketSearch}
                selectedProviders={selectedProviders}
                setSelectedProviders={setSelectedProviders}
                bucketSortConfig={bucketSortConfig}
                setBucketSortConfig={setBucketSortConfig}
                bucketPage={bucketPage}
                setBucketPage={setBucketPage}
                getFilteredAndSortedBuckets={getFilteredAndSortedBuckets}
                getPaginatedBuckets={getPaginatedBuckets}
                getTotalBucketPages={getTotalBucketPages}
                isBucketDialogOpen={isBucketDialogOpen}
                setIsBucketDialogOpen={setIsBucketDialogOpen}
                bucketDialogMode={bucketDialogMode}
                editingBucketProviderType={editingBucketProvider?.type}
                bucketForm={bucketForm}
                setBucketForm={setBucketForm}
                handleOpenCreateBucket={handleOpenCreateBucket}
                handleOpenEditBucket={handleOpenEditBucket}
                confirmDialog={confirmDialog}
                setConfirmDialog={setConfirmDialog}
                onBucketClick={handleBucketClickWithProvider}
                onBucketSubmit={handleBucketSubmit}
                onConfirmAction={handleConfirmAction}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                isMutationPending={bucketMutationPending}
            />
        );
    }

    return (
        <FileListView
            storageProviderId={effectiveProviderId}
            currentBucket={currentBucket}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            page={page}
            setPage={setPage}
            sortConfig={sortConfig}
            handleSort={handleSort}
            getSortedFiles={getSortedFiles}
            fileSearch={fileSearch}
            setFileSearch={setFileSearch}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            handleSelectAll={handleSelectAll}
            handleSelectFile={handleSelectFile}
            selectMode={selectMode}
            onFileSelect={onFileSelect}
            isBucketDialogOpen={isBucketDialogOpen}
            setIsBucketDialogOpen={setIsBucketDialogOpen}
            bucketDialogMode={bucketDialogMode}
            editingBucketProviderType={editingBucketProvider?.type}
            bucketForm={bucketForm}
            setBucketForm={setBucketForm}
            handleOpenEditBucket={handleOpenEditBucket}
            confirmDialog={confirmDialog}
            setConfirmDialog={setConfirmDialog}
            isFolderDialogOpen={isFolderDialogOpen}
            setIsFolderDialogOpen={setIsFolderDialogOpen}
            newFolderName={newFolderName}
            setNewFolderName={setNewFolderName}
            isRenameDialogOpen={isRenameDialogOpen}
            setIsRenameDialogOpen={setIsRenameDialogOpen}
            renameTarget={renameTarget}
            newName={newName}
            setNewName={setNewName}
            handleRename={handleRename}
            isMoveDialogOpen={isMoveDialogOpen}
            setIsMoveDialogOpen={setIsMoveDialogOpen}
            moveTargets={moveTargets}
            moveDestBucket={moveDestBucket}
            moveDestPath={moveDestPath}
            setMoveDestBucket={setMoveDestBucket}
            setMoveDestPath={setMoveDestPath}
            handleMove={handleMove}
            handleBack={handleBackWithProvider}
            setCurrentBucket={setCurrentBucket}
            onBucketSubmit={handleBucketSubmit}
            onConfirmAction={handleConfirmAction}
            onCreateFolder={handleCreateFolder}
            onRenameSubmit={handleRenameSubmit}
            onMoveSubmit={handleMoveSubmit}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            uploadMutation={uploadMutation}
            deleteMutation={deleteMutation}
            createFolderMutation={createFolderMutation}
            renameMutation={renameMutation}
            moveMutation={moveMutation}
            bucketMutationPending={bucketMutationPending}
        />
    );
}

export default FileBrowser;
