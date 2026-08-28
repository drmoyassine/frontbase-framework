// FileListView — File table with breadcrumbs, sort, select, actions, and all file dialogs

import React from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    FolderOpen, Folder, File, Upload, RefreshCw, Settings,
    MoreVertical, Trash2, Archive, X, Search, ArrowLeft, ArrowUp, ArrowDown,
    ChevronsUpDown, Check, Loader2, Move, Edit2, Share2, FolderPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Bucket, StorageFile, SortConfig, BucketFormState, ConfirmDialogState, RenameTarget } from './types';
import { PAGE_SIZE } from './constants';
import { formatBytes, getFileIcon } from './utils';
import { fetchBuckets, fetchFiles, getSignedUrl, getPublicUrl, computeSize } from './api';

import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { BucketDialog } from './dialogs/BucketDialog';
import { CreateFolderDialog } from './dialogs/CreateFolderDialog';
import { RenameDialog } from './dialogs/RenameDialog';
import { MoveDialog } from './dialogs/MoveDialog';
import { ShareLinkDialog } from './dialogs/ShareLinkDialog';

interface FileListViewProps {
    storageProviderId: string;
    currentBucket: string;
    currentPath: string;
    setCurrentPath: (v: string) => void;
    page: number;
    setPage: (v: number | ((p: number) => number)) => void;

    // Sort
    sortConfig: SortConfig;
    handleSort: (key: SortConfig['key']) => void;
    getSortedFiles: (
        files: StorageFile[],
        folderSizes?: Record<string, { size?: number; isLoading?: boolean; isError?: boolean }>
    ) => StorageFile[];
    // Search / selection
    fileSearch: string;
    setFileSearch: (v: string) => void;
    selectedFiles: Set<string>;
    setSelectedFiles: (v: Set<string>) => void;
    handleSelectAll: (selectAll: boolean, files: StorageFile[]) => void;
    handleSelectFile: (name: string, selected: boolean) => void;
    // File select mode
    selectMode?: boolean;
    onFileSelect?: (url: string, file: StorageFile) => void;
    // Bucket dialog (edit from file view)
    isBucketDialogOpen: boolean;
    setIsBucketDialogOpen: (v: boolean) => void;
    bucketDialogMode: 'create' | 'edit';
    editingBucketProviderType?: string;
    bucketForm: BucketFormState;
    setBucketForm: (v: BucketFormState) => void;
    handleOpenEditBucket: (bucket: Bucket, e: React.MouseEvent) => void;
    // Confirm dialog
    confirmDialog: ConfirmDialogState;
    setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
    // Folder dialog
    isFolderDialogOpen: boolean;
    setIsFolderDialogOpen: (v: boolean) => void;
    newFolderName: string;
    setNewFolderName: (v: string) => void;
    // Rename dialog
    isRenameDialogOpen: boolean;
    setIsRenameDialogOpen: (v: boolean) => void;
    renameTarget: RenameTarget | null;
    newName: string;
    setNewName: (v: string) => void;
    handleRename: (file: StorageFile) => void;
    // Move dialog
    isMoveDialogOpen: boolean;
    setIsMoveDialogOpen: (v: boolean) => void;
    moveTargets: string[];
    moveDestBucket: string | null;
    moveDestPath: string;
    setMoveDestBucket: (v: string) => void;
    setMoveDestPath: (v: string) => void;
    handleMove: (target: string | string[]) => void;
    // Navigation
    handleBack: () => void;
    setCurrentBucket: (v: string | null) => void;
    // Actions
    onBucketSubmit: () => void;
    onConfirmAction: () => void;
    onCreateFolder: () => void;
    onRenameSubmit: () => void;
    onMoveSubmit: () => void;
    onRefresh: () => Promise<void>;
    isRefreshing: boolean;
    // Mutations
    uploadMutation: { mutate: (file: File) => void; isPending: boolean };
    deleteMutation: { mutate: (paths: string[]) => void };
    createFolderMutation: { isPending: boolean };
    renameMutation: { isPending: boolean };
    moveMutation: { isPending: boolean };
    bucketMutationPending: boolean;
}

export function FileListView({
    storageProviderId, currentBucket, currentPath, setCurrentPath,
    page, setPage,
    sortConfig, handleSort, getSortedFiles,
    fileSearch, setFileSearch,
    selectedFiles, setSelectedFiles, handleSelectAll, handleSelectFile,
    selectMode, onFileSelect,
    isBucketDialogOpen, setIsBucketDialogOpen,
    bucketDialogMode, editingBucketProviderType, bucketForm, setBucketForm, handleOpenEditBucket,
    confirmDialog, setConfirmDialog,
    isFolderDialogOpen, setIsFolderDialogOpen, newFolderName, setNewFolderName,
    isRenameDialogOpen, setIsRenameDialogOpen, renameTarget, newName, setNewName, handleRename,
    isMoveDialogOpen, setIsMoveDialogOpen, moveTargets, moveDestBucket, moveDestPath, setMoveDestBucket, setMoveDestPath, handleMove,
    handleBack, setCurrentBucket,
    onBucketSubmit, onConfirmAction, onCreateFolder, onRenameSubmit, onMoveSubmit,
    onRefresh, isRefreshing,
    uploadMutation, deleteMutation, createFolderMutation, renameMutation, moveMutation, bucketMutationPending,
}: FileListViewProps) {
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [shareFile, setShareFile] = React.useState<string | null>(null);
    const [uploadingCount, setUploadingCount] = React.useState(0);

    // ── Bucket query (React Query deduplicates with BucketListView) ──
    const { data: bucketsResult } = useQuery({
        queryKey: ['storage-buckets', storageProviderId],
        queryFn: () => fetchBuckets(storageProviderId),
        staleTime: STALE.DEFAULT,
    });
    const buckets = bucketsResult?.buckets;

    // ── File query ──
    const fullPath = `${currentBucket}/${currentPath}`.replace(/\/$/, '');
    const { data: files, isLoading: filesLoading, error: filesError } = useQuery({
        queryKey: ['storage-files', storageProviderId, fullPath, page, fileSearch, sortConfig.key, sortConfig.direction],
        queryFn: () => fetchFiles(
            storageProviderId,
            currentBucket,
            currentPath || undefined,
            page,
            PAGE_SIZE,
            fileSearch,
            sortConfig.key,
            sortConfig.direction
        ),
        enabled: !!currentBucket,
    });

    // ── Cached folder sizes ──
    const folderFiles = React.useMemo(() => (files ?? []).filter((f) => f.isFolder), [files]);
    const folderSizeQueries = useQueries({
        queries: folderFiles.map((f) => {
            const folderPath = currentPath ? `${currentPath}/${f.name}` : f.name;
            return {
                queryKey: ['storage-size', storageProviderId, currentBucket, folderPath],
                queryFn: () => computeSize(storageProviderId, currentBucket, folderPath),
                staleTime: STALE.STANDARD,
                enabled: !!currentBucket,
            };
        }),
    });
    const folderSizes = React.useMemo(() => {
        const map: Record<string, { size: number | undefined; isLoading: boolean; isError: boolean }> = {};
        folderFiles.forEach((f, i) => {
            const q = folderSizeQueries[i];
            map[f.name] = { size: q?.data, isLoading: q?.isLoading ?? true, isError: q?.isError ?? false };
        });
        return map;
    }, [folderFiles, folderSizeQueries]);

    // ── Computed ──
    const filteredFiles = files || [];
    const currentBucketData = buckets?.find(b => b.name === currentBucket);

    // ── Breadcrumb segments ──
    const breadcrumbSegments = React.useMemo(() => {
        const segments: { label: string; path: string | null }[] = [
            { label: currentBucketData?.provider || 'Supabase', path: null },
            { label: currentBucket || '', path: '' },
        ];
        if (currentPath) {
            const parts = currentPath.split('/');
            parts.forEach((part, index) => {
                segments.push({ label: part, path: parts.slice(0, index + 1).join('/') });
            });
        }
        return segments;
    }, [currentBucket, currentPath, currentBucketData?.provider]);

    const handleBreadcrumbClick = (segment: { label: string; path: string | null }) => {
        if (segment.path === null) {
            setCurrentBucket(null);
            setCurrentPath('');
        } else {
            setCurrentPath(segment.path);
        }
        setPage(0);
    };

    // ── Event handlers ──
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (fileList && fileList.length > 0) {
            setUploadingCount(fileList.length);
            Array.from(fileList).forEach(file => uploadMutation.mutate(file));
        }
        e.target.value = '';
    };

    const handleFileClick = async (file: StorageFile) => {
        if (file.isFolder) {
            const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            setCurrentPath(newPath);
            setPage(0);
        } else {
            const path = currentPath ? `${currentPath}/${file.name}` : file.name;
            try {
                const isPublicBucket = currentBucketData?.public ?? false;
                const url = isPublicBucket
                    ? await getPublicUrl(storageProviderId, path, currentBucket)
                    : await getSignedUrl(storageProviderId, path, currentBucket);
                if (selectMode && onFileSelect) {
                    onFileSelect(url, file);
                } else {
                    window.open(url, '_blank');
                }
            } catch {
                toast({ title: 'Open Failed', description: 'Failed to open file.', variant: 'destructive' });
            }
        }
    };

    const handleShareLink = (fileName: string) => {
        setShareFile(fileName);
    };

    const handleDeleteFile = (file: { name: string; id: string; isFolder?: boolean }) => {
        // Use the file's id which already includes trailing / for folders
        const path = file.id;
        const label = file.isFolder ? 'Delete Folder' : 'Delete File';
        const desc = file.isFolder
            ? `Are you sure you want to delete the folder "${file.name}" and ALL its contents? This cannot be undone.`
            : `Are you sure you want to delete ${file.name}? This cannot be undone.`;
        setConfirmDialog({
            isOpen: true, title: label,
            description: desc,
            actionLabel: 'Delete', variant: 'destructive', actionType: 'delete', targetId: path,
        });
    };

    const handleBulkDelete = () => {
        if (selectedFiles.size === 0) return;
        setConfirmDialog({
            isOpen: true, title: 'Delete Multiple Files',
            description: `Are you sure you want to delete ${selectedFiles.size} files? This cannot be undone.`,
            actionLabel: 'Delete All', variant: 'destructive', actionType: 'delete', targetId: null,
        });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleBack}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        {/* Breadcrumb Navigation */}
                        <nav className="flex items-center gap-1 text-sm">
                            {breadcrumbSegments.map((segment, index) => (
                                <React.Fragment key={index}>
                                    {index > 0 && <span className="text-muted-foreground mx-1">/</span>}
                                    {index === 0 ? (
                                        <Badge
                                            variant="outline"
                                            className="cursor-pointer hover:bg-muted text-[10px] font-semibold bg-[#006239]/10 text-[#006239] border-[#006239]/20"
                                            onClick={() => handleBreadcrumbClick(segment)}
                                        >
                                            {segment.label}
                                        </Badge>
                                    ) : index === breadcrumbSegments.length - 1 ? (
                                        <span className="font-medium flex items-center gap-1">
                                            <FolderOpen className="h-4 w-4" />
                                            {segment.label}
                                        </span>
                                    ) : (
                                        <button
                                            className="text-muted-foreground hover:text-foreground hover:underline"
                                            onClick={() => handleBreadcrumbClick(segment)}
                                        >
                                            {segment.label}
                                        </button>
                                    )}
                                </React.Fragment>
                            ))}
                        </nav>
                    </div>
                    <div className="flex gap-2 items-center">
                        {selectedFiles.size > 0 && (
                            <div className="flex items-center gap-2 mr-2 bg-muted/50 px-3 py-1 rounded-full border text-sm">
                                <span className="font-medium text-muted-foreground">{selectedFiles.size} selected</span>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedFiles(new Set())} title="Deselect All">
                                    <X className="h-3 w-3" />
                                </Button>
                                <div className="w-px h-4 bg-border mx-1" />
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleBulkDelete} title="Delete Selected">
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleMove(Array.from(selectedFiles).map((name) => (currentPath ? `${currentPath}/${name}` : name)))} title="Move Selected">
                                    <Move className="h-3 w-3" />
                                </Button>
                            </div>
                        )}
                        <div className="relative w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="search" placeholder="Search files..." className="pl-8 h-9" value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}><RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} /></Button>
                            <Button variant="outline" size="sm" onClick={() => setIsFolderDialogOpen(true)}><FolderPlus className="h-4 w-4 mr-1" /> New Folder</Button>
                            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                                <Upload className="h-4 w-4 mr-1" /> {uploadMutation.isPending ? `Uploading${uploadingCount > 1 ? ` ${uploadingCount}` : ''}...` : 'Upload'}
                            </Button>
                            {/* Bucket actions menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 w-9 p-0"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) handleOpenEditBucket(bucket, {} as React.MouseEvent);
                                    }}>
                                        <Settings className="h-4 w-4 mr-2" /> Bucket Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) setConfirmDialog({ isOpen: true, title: 'Empty Bucket', description: `Are you sure you want to empty "${bucket.name}"? This will delete all files.`, actionLabel: 'Empty', variant: 'destructive', actionType: 'empty', targetId: bucket.id });
                                    }}>
                                        <Archive className="h-4 w-4 mr-2" /> Empty Bucket
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) setConfirmDialog({ isOpen: true, title: 'Delete Bucket', description: `Are you sure you want to delete "${bucket.name}"?`, actionLabel: 'Delete', variant: 'destructive', actionType: 'deleteBucket', targetId: bucket.id });
                                    }}>
                                        <X className="h-4 w-4 mr-2" /> Delete Bucket
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {filesLoading ? (
                    <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : filesError ? (
                    <div className="text-center py-8 text-muted-foreground"><p>Failed to load files</p><p className="text-sm">{(filesError as Error).message}</p></div>
                ) : files && files.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <div className="flex items-center justify-center">
                                        <div className={cn("h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors", selectedFiles.size > 0 && selectedFiles.size === files.length ? "bg-primary text-primary-foreground" : "bg-transparent")} onClick={() => handleSelectAll(selectedFiles.size !== files.length, files)}>
                                            {selectedFiles.size > 0 && selectedFiles.size === files.length && <Check className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </TableHead>
                                <TableHead className="w-[40%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'name' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('type')}>
                                    <div className="flex items-center gap-1">Type {sortConfig.key === 'type' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'type' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('updated_at')}>
                                    <div className="flex items-center gap-1">Date Modified {sortConfig.key === 'updated_at' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'updated_at' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[15%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('size')}>
                                    <div className="flex items-center gap-1">Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'size' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[5%]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredFiles.map((file) => {
                                const FileIcon = getFileIcon(file.name);
                                return (
                                    <TableRow key={file.id}>
                                        <TableCell>
                                            <div className="flex items-center justify-center">
                                                <div className={cn("h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors", selectedFiles.has(file.name) ? "bg-primary text-primary-foreground" : "bg-transparent")} onClick={(e) => { e.stopPropagation(); handleSelectFile(file.name, !selectedFiles.has(file.name)); }}>
                                                    {selectedFiles.has(file.name) && <Check className="h-3 w-3" />}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                {file.isFolder ? <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20" /> : <FileIcon className="h-4 w-4 text-muted-foreground" />}
                                                <button onClick={() => handleFileClick(file)} className={cn("font-medium text-sm text-left hover:underline", file.isFolder ? "text-foreground font-semibold" : "text-foreground")}>{file.name}</button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{file.isFolder ? 'Folder' : file.mimetype || file.name.split('.').pop()?.toUpperCase() || 'File'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{file.updated_at ? new Date(file.updated_at).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {file.isFolder
                                                ? (() => {
                                                    const s = folderSizes[file.name];
                                                    if (!s || s.isLoading) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Calculating…</span>;
                                                    if (s.isError) return <span className="text-xs text-muted-foreground">—</span>;
                                                    return formatBytes(s.size ?? 0);
                                                })()
                                                : formatBytes(file.size)
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleShareLink(file.name)}><Share2 className="h-4 w-4 mr-2" /> Share Link</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleRename(file)}><Edit2 className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMove(currentPath ? `${currentPath}/${file.name}` : file.name)}><Move className="h-4 w-4 mr-2" /> Move</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDeleteFile(file)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-8 text-muted-foreground"><File className="mx-auto h-12 w-12 mb-4" /><p>No files in this bucket</p><p className="text-sm">Upload files to get started</p></div>
                )}

                {files && files.length > 0 && (
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button variant="outline" size="sm" onClick={() => setPage((p: number) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                        <div className="text-sm text-muted-foreground">Page {page + 1}</div>
                        <Button variant="outline" size="sm" onClick={() => setPage((p: number) => p + 1)} disabled={files.length < PAGE_SIZE}>Next</Button>
                    </div>
                )}
            </CardContent>

            {/* Dialogs */}
            <ConfirmDialog
                dialog={confirmDialog}
                onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}
                onConfirm={onConfirmAction}
            />
            <BucketDialog
                open={isBucketDialogOpen}
                onOpenChange={setIsBucketDialogOpen}
                mode={bucketDialogMode}
                form={bucketForm}
                onFormChange={setBucketForm}
                onSubmit={onBucketSubmit}
                isPending={bucketMutationPending}
                providerType={editingBucketProviderType}
            />
            <CreateFolderDialog
                open={isFolderDialogOpen}
                onOpenChange={setIsFolderDialogOpen}
                folderName={newFolderName}
                onFolderNameChange={setNewFolderName}
                onSubmit={onCreateFolder}
                isPending={createFolderMutation.isPending}
            />
            <RenameDialog
                open={isRenameDialogOpen}
                onOpenChange={setIsRenameDialogOpen}
                target={renameTarget}
                newName={newName}
                onNewNameChange={setNewName}
                onSubmit={onRenameSubmit}
                isPending={renameMutation.isPending}
            />
            <MoveDialog
                open={isMoveDialogOpen}
                onOpenChange={setIsMoveDialogOpen}
                storageProviderId={storageProviderId}
                moveTargets={moveTargets}
                buckets={buckets}
                destBucket={moveDestBucket}
                destPath={moveDestPath}
                onDestBucketChange={setMoveDestBucket}
                onDestPathChange={setMoveDestPath}
                onSubmit={onMoveSubmit}
                isPending={moveMutation.isPending}
            />
            <ShareLinkDialog
                open={!!shareFile}
                onOpenChange={(open) => { if (!open) setShareFile(null); }}
                fileName={shareFile || ''}
                isPublicBucket={currentBucketData?.public ?? false}
                onGenerateUrl={async (expiresIn) => {
                    const path = currentPath ? `${currentPath}/${shareFile}` : (shareFile || '');
                    return await getSignedUrl(storageProviderId, path, currentBucket, expiresIn);
                }}
                onGetPublicUrl={async () => {
                    const path = currentPath ? `${currentPath}/${shareFile}` : (shareFile || '');
                    return await getPublicUrl(storageProviderId, path, currentBucket);
                }}
            />
        </Card>
    );
}
