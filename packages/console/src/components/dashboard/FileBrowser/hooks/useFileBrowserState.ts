// FileBrowser State Hook

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Bucket,
    StorageFile,
    SortConfig,
    BucketSortConfig,
    ConfirmDialogState,
    BucketFormState,
    RenameTarget,
} from '../types';
import { BUCKET_PAGE_SIZE } from '../constants';

export function useFileBrowserState() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Navigation State (synchronized with URL search parameters)
    const currentBucket = searchParams.get('bucket');
    const currentPath = searchParams.get('path') || '';
    const rawPage = searchParams.get('page');
    const page = rawPage ? Math.max(0, parseInt(rawPage, 10) - 1) : 0;

    const setCurrentBucket = (bucket: string | null) => {
        const params = new URLSearchParams(searchParams);
        if (bucket) {
            params.set('bucket', bucket);
        } else {
            params.delete('bucket');
        }
        params.delete('path');
        params.delete('page');
        setSearchParams(params, { replace: true });
    };

    const setCurrentPath = (path: string) => {
        const params = new URLSearchParams(searchParams);
        if (path) {
            params.set('path', path);
        } else {
            params.delete('path');
        }
        params.delete('page');
        setSearchParams(params, { replace: true });
    };

    const setPage = (v: number | ((p: number) => number)) => {
        const params = new URLSearchParams(searchParams);
        const newPage = typeof v === 'function' ? v(page) : v;
        params.set('page', (newPage + 1).toString());
        setSearchParams(params, { replace: true });
    };

    // File Sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });

    // Bucket Dialog State
    const [isBucketDialogOpen, setIsBucketDialogOpen] = useState(false);
    const [bucketDialogMode, setBucketDialogMode] = useState<'create' | 'edit'>('create');
    const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
    const [editingBucketProvider, setEditingBucketProvider] = useState<{ type: string; id: string } | null>(null);
    const [bucketForm, setBucketForm] = useState<BucketFormState>({
        name: '',
        public: false,
        fileSizeLimit: '',
        allowedMimeTypes: '',
    });

    // Confirmation Dialog State
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
        isOpen: false,
        title: '',
        description: '',
        actionLabel: '',
        actionType: null,
        targetId: null,
    });

    // Folder Dialog State
    const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // Rename Dialog State
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
    const [newName, setNewName] = useState('');

    // Search & Multi-Select State
    const [bucketSearch, setBucketSearch] = useState('');
    const [fileSearch, setFileSearch] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    // Bucket Advanced Controls State
    const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
    const [bucketSortConfig, setBucketSortConfig] = useState<BucketSortConfig>({
        key: 'name',
        direction: 'asc',
    });
    const [bucketPage, setBucketPage] = useState(1);

    // Move Dialog State
    const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
    const [moveTargets, setMoveTargets] = useState<string[]>([]);
    const [moveDestBucket, setMoveDestBucket] = useState<string | null>(null);
    const [moveDestPath, setMoveDestPath] = useState<string>('');

    // Auto-deselect on navigation
    useEffect(() => {
        setSelectedFiles(new Set());
    }, [currentBucket, currentPath]);

    // Bucket filtering and sorting
    const getFilteredAndSortedBuckets = (buckets: Bucket[] | undefined) => {
        if (!buckets) return [];

        return [...buckets]
            .filter((b) => {
                const matchesSearch = b.name.toLowerCase().includes(bucketSearch.toLowerCase());
                const matchesProvider = selectedProviders.length === 0 || selectedProviders.includes(b.provider);
                return matchesSearch && matchesProvider;
            })
            .sort((a, b) => {
                const { key, direction } = bucketSortConfig;
                const aValue = a[key as keyof Bucket];
                const bValue = b[key as keyof Bucket];

                if (aValue < bValue) return direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return direction === 'asc' ? 1 : -1;
                return 0;
            });
    };

    const getPaginatedBuckets = (filteredBuckets: Bucket[]) => {
        return filteredBuckets.slice(
            (bucketPage - 1) * BUCKET_PAGE_SIZE,
            bucketPage * BUCKET_PAGE_SIZE
        );
    };

    const getTotalBucketPages = (filteredBuckets: Bucket[]) => {
        return Math.ceil(filteredBuckets.length / BUCKET_PAGE_SIZE);
    };

    // File sorting
    const getSortedFiles = (
        files: StorageFile[],
        folderSizes?: Record<string, { size?: number; isLoading?: boolean; isError?: boolean }>
    ) => {
        return [...files].sort((a, b) => {
            // Always keep folders on top
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

            let aValue: any;
            let bValue: any;

            if (sortConfig.key === 'size') {
                aValue = a.isFolder ? (folderSizes?.[a.name]?.size ?? 0) : (a.size ?? 0);
                bValue = b.isFolder ? (folderSizes?.[b.name]?.size ?? 0) : (b.size ?? 0);
            } else if (sortConfig.key === 'type') {
                aValue = a.isFolder ? 'Folder' : a.mimetype || a.name.split('.').pop() || '';
                bValue = b.isFolder ? 'Folder' : b.mimetype || b.name.split('.').pop() || '';
            } else {
                aValue = a[sortConfig.key];
                bValue = b[sortConfig.key];
            }

            // Handle undefined/null
            if (sortConfig.key !== 'size') {
                if (aValue === undefined || aValue === null) aValue = '';
                if (bValue === undefined || bValue === null) bValue = '';
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // Handlers
    const handleSort = (key: SortConfig['key']) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleSelectAll = (checked: boolean, files: StorageFile[] | undefined) => {
        if (checked && files) {
            setSelectedFiles(new Set(files.map((f) => f.name)));
        } else {
            setSelectedFiles(new Set());
        }
    };

    const handleSelectFile = (name: string, checked: boolean) => {
        const newSelected = new Set(selectedFiles);
        if (checked) {
            newSelected.add(name);
        } else {
            newSelected.delete(name);
        }
        setSelectedFiles(newSelected);
    };

    const handleBucketClick = (bucket: Bucket) => {
        const params = new URLSearchParams(searchParams);
        params.set('bucket', bucket.name);
        params.delete('path');
        params.delete('page');
        setSearchParams(params, { replace: true });
    };

    const handleBack = () => {
        const params = new URLSearchParams(searchParams);
        if (currentPath) {
            const parts = currentPath.split('/');
            parts.pop();
            const newPath = parts.join('/');
            if (newPath) {
                params.set('path', newPath);
            } else {
                params.delete('path');
            }
            params.delete('page');
        } else {
            params.delete('bucket');
            params.delete('path');
            params.delete('page');
        }
        setSearchParams(params, { replace: true });
    };

    const handleOpenCreateBucket = () => {
        setBucketDialogMode('create');
        setBucketForm({ name: '', public: false, fileSizeLimit: '', allowedMimeTypes: '' });
        setIsBucketDialogOpen(true);
    };

    const handleOpenEditBucket = (bucket: Bucket, e: React.MouseEvent) => {
        e.stopPropagation();
        setBucketDialogMode('edit');
        setEditingBucketId(bucket.id);
        setEditingBucketProvider({
            type: bucket.provider || '',
            id: bucket.providerId || '',
        });
        setBucketForm({
            name: bucket.name,
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit ? (bucket.file_size_limit / (1024 * 1024)).toString() : '',
            allowedMimeTypes: bucket.allowed_mime_types?.join(', ') || '',
        });
        setIsBucketDialogOpen(true);
    };

    const handleRename = (file: StorageFile) => {
        setRenameTarget({ name: file.name, isFolder: file.isFolder || false });
        setNewName(file.name);
        setIsRenameDialogOpen(true);
    };

    const handleMove = (paths: string | string[]) => {
        const targetPaths = Array.isArray(paths) ? paths : [paths];
        setMoveTargets(targetPaths);
        setMoveDestBucket(currentBucket);
        setMoveDestPath('');
        setIsMoveDialogOpen(true);
    };

    return {
        // Navigation
        currentBucket,
        setCurrentBucket,
        currentPath,
        setCurrentPath,
        page,
        setPage,

        // File Sorting
        sortConfig,
        setSortConfig,
        handleSort,
        getSortedFiles,

        // Bucket Dialog
        isBucketDialogOpen,
        setIsBucketDialogOpen,
        bucketDialogMode,
        setBucketDialogMode,
        editingBucketId,
        setEditingBucketId,
        bucketForm,
        setBucketForm,
        handleOpenCreateBucket,
        handleOpenEditBucket,
        editingBucketProvider,

        // Confirmation Dialog
        confirmDialog,
        setConfirmDialog,

        // Folder Dialog
        isFolderDialogOpen,
        setIsFolderDialogOpen,
        newFolderName,
        setNewFolderName,

        // Rename Dialog
        isRenameDialogOpen,
        setIsRenameDialogOpen,
        renameTarget,
        setRenameTarget,
        newName,
        setNewName,
        handleRename,

        // Search & Selection
        bucketSearch,
        setBucketSearch,
        fileSearch,
        setFileSearch,
        selectedFiles,
        setSelectedFiles,
        handleSelectAll,
        handleSelectFile,

        // Bucket Controls
        selectedProviders,
        setSelectedProviders,
        bucketSortConfig,
        setBucketSortConfig,
        bucketPage,
        setBucketPage,
        getFilteredAndSortedBuckets,
        getPaginatedBuckets,
        getTotalBucketPages,

        // Move Dialog
        isMoveDialogOpen,
        setIsMoveDialogOpen,
        moveTargets,
        setMoveTargets,
        moveDestBucket,
        setMoveDestBucket,
        moveDestPath,
        setMoveDestPath,
        handleMove,

        // Navigation handlers
        handleBucketClick,
        handleBack,
    };
}
