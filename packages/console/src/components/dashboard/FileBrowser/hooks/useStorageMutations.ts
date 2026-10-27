// FileBrowser Mutations Hook — all scoped by storageProviderId

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import {
    createBucket,
    updateBucket,
    deleteBucket,
    emptyBucket,
    deleteFile,
    uploadFile,
    createFolder,
    moveFile,
} from '../api';

interface UseStorageMutationsOptions {
    storageProviderId: string;
    currentBucket: string | null;
    currentPath: string;
    editingBucketId: string | null;
    setIsBucketDialogOpen: (open: boolean) => void;
    setIsFolderDialogOpen: (open: boolean) => void;
    setNewFolderName: (name: string) => void;
    setIsRenameDialogOpen: (open: boolean) => void;
    setRenameTarget: (target: null) => void;
    setNewName: (name: string) => void;
    setIsMoveDialogOpen: (open: boolean) => void;
    setMoveTargets: (targets: string[]) => void;
    setSelectedFiles: (files: Set<string>) => void;
    setConfirmDialog: (dialog: any) => void;
    setCurrentBucket: (bucket: string | null) => void;
}

export function useStorageMutations(options: UseStorageMutationsOptions) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const {
        storageProviderId,
        currentBucket,
        currentPath,
        editingBucketId,
        setIsBucketDialogOpen,
        setIsFolderDialogOpen,
        setNewFolderName,
        setIsRenameDialogOpen,
        setRenameTarget,
        setNewName,
        setIsMoveDialogOpen,
        setMoveTargets,
        setSelectedFiles,
        setConfirmDialog,
        setCurrentBucket,
    } = options;

    const pid = storageProviderId;

    const createBucketMutation = useMutation({
        mutationFn: (data: any) => {
            const targetPid = data._providerId || pid;
            return createBucket(targetPid, data.name, data.public, data.fileSizeLimit, data.allowedMimeTypes, data.projectId);
        },
        onSuccess: () => {
            // Invalidate ALL provider bucket queries so unified view refreshes
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            setIsBucketDialogOpen(false);
            toast({ title: 'Bucket created' });
        },
        onError: (err) =>
            toast({
                title: 'Failed to create bucket',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const updateBucketMutation = useMutation({
        mutationFn: (data: any) => {
            const targetPid = data._providerId || pid;
            return updateBucket(targetPid, data.id, data.public, data.fileSizeLimit, data.allowedMimeTypes);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            setIsBucketDialogOpen(false);
            toast({ title: 'Bucket updated' });
        },
        onError: (err) =>
            toast({
                title: 'Failed to update bucket',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const deleteBucketMutation = useMutation({
        mutationFn: ({ id, providerId }: { id: string; providerId?: string }) =>
            deleteBucket(providerId || pid, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            if (currentBucket === editingBucketId) setCurrentBucket(null);
            toast({ title: 'Bucket deleted' });
            setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
        },
        onError: (err) =>
            toast({
                title: 'Failed to delete bucket',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const emptyBucketMutation = useMutation({
        mutationFn: ({ id, providerId }: { id: string; providerId?: string }) =>
            emptyBucket(providerId || pid, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            queryClient.invalidateQueries({ queryKey: ['storage-size'] });
            toast({ title: 'Bucket emptied' });
            setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
        },
        onError: (err) =>
            toast({
                title: 'Failed to empty bucket',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const deleteMutation = useMutation({
        mutationFn: (paths: string[]) => deleteFile(pid, paths, currentBucket || undefined),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-size'] });
            setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
            toast({ title: 'File deleted' });
        },
        onError: (err) =>
            toast({
                title: 'Delete Failed',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const path = currentPath ? `${currentPath}/${file.name}` : file.name;
            return uploadFile(pid, file, path, currentBucket || undefined);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-size'] });
            toast({ title: 'File uploaded' });
        },
        onError: (err) => {
            console.error('[Upload Error Debug]', err, typeof err, err instanceof Error, (err as any)?.message);
            const errorMessage = err instanceof Error ? err.message : String(err);
            toast({
                title: 'Upload Failed',
                description: errorMessage || 'Unknown error',
                variant: 'destructive',
            });
        },
    });

    const createFolderMutation = useMutation({
        mutationFn: async (folderName: string) => {
            const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            return createFolder(pid, folderPath, currentBucket!);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', pid] });
            setIsFolderDialogOpen(false);
            setNewFolderName('');
            toast({ title: 'Folder created' });
        },
        onError: (err) =>
            toast({
                title: 'Create Folder Failed',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const renameMutation = useMutation({
        mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
            const sourceKey = currentPath ? `${currentPath}/${oldName}` : oldName;
            const destKey = currentPath ? `${currentPath}/${newName}` : newName;
            return moveFile(pid, sourceKey, destKey, { sourceBucket: currentBucket!, destBucket: currentBucket! });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', pid] });
            setIsRenameDialogOpen(false);
            setRenameTarget(null);
            setNewName('');
            toast({ title: 'Renamed successfully' });
        },
        onError: (err) =>
            toast({
                title: 'Rename Failed',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    const moveMutation = useMutation({
        mutationFn: async ({
            targets,
            destBucket,
            destPath,
            sourceBucket,
        }: {
            targets: string[];
            destBucket: string;
            destPath: string;
            sourceBucket: string;
        }) => {
            return Promise.all(
                targets.map((targetPath) => {
                    const fileName = targetPath.split('/').pop()!;
                    const destinationKey = destPath ? `${destPath}/${fileName}` : fileName;
                    return moveFile(pid, targetPath, destinationKey, { sourceBucket, destBucket });
                })
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files', pid] });
            queryClient.invalidateQueries({ queryKey: ['storage-buckets', pid] });
            setIsMoveDialogOpen(false);
            setMoveTargets([]);
            setSelectedFiles(new Set());
            toast({ title: 'Moved successfully' });
        },
        onError: (err) =>
            toast({
                title: 'Move Failed',
                description: (err as Error).message,
                variant: 'destructive',
            }),
    });

    return {
        createBucketMutation,
        updateBucketMutation,
        deleteBucketMutation,
        emptyBucketMutation,
        deleteMutation,
        uploadMutation,
        createFolderMutation,
        renameMutation,
        moveMutation,
    };
}
