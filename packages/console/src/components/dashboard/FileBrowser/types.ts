// FileBrowser Types

export interface Bucket {
    id: string;
    name: string;
    public: boolean;
    created_at: string;
    provider?: string;
    /** Storage provider ID — used to scope API calls to the correct provider */
    providerId?: string;
    /** Human-readable provider label (e.g. "Cloudflare R2") for display */
    providerLabel?: string;
    size?: number;
    file_size_limit?: number;
    allowed_mime_types?: string[];
}

export interface StorageFile {
    name: string;
    id: string;
    size: number;
    updated_at?: string;
    mimetype?: string;
    isFolder: boolean;
    metadata?: any;
}

// Alias for compatibility
export type FileObject = StorageFile;

export type SortKey = 'name' | 'type' | 'updated_at' | 'size';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

export interface BucketSortConfig {
    key: 'name' | 'created_at' | 'size';
    direction: 'asc' | 'desc';
}

export interface ConfirmDialogState {
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    actionType: 'delete' | 'empty' | 'deleteBucket' | null;
    targetId: string | null;
    variant?: 'default' | 'destructive';
}

export interface BucketFormState {
    name: string;
    public: boolean;
    fileSizeLimit: string;
    allowedMimeTypes: string;
}

export interface RenameTarget {
    name: string;
    isFolder: boolean;
}
