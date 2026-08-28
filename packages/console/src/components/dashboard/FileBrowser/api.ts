// FileBrowser API Functions — all scoped by storageProviderId

import api from '@/services/api-service';
import { Bucket, StorageFile } from './types';

// ── Lazy size computation (non-blocking) ──────────────────────────────
export async function computeSize(
    providerId: string,
    bucket: string,
    path: string = '',
): Promise<number> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('bucket', bucket);
    if (path) params.set('path', path);
    const res = await api.get(`/api/storage/compute-size?${params.toString()}`);
    return res.data.size ?? 0;
}

export async function createBucket(
    providerId: string,
    name: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[],
    projectId?: string,
) {
    try {
        const body: Record<string, unknown> = {
            name,
            public: isPublic,
            file_size_limit: fileSizeLimit,
            allowed_mime_types: allowedMimeTypes,
        };
        if (projectId) body.project_id = projectId;
        const res = await api.post(`/api/storage/buckets?provider_id=${providerId}`, body);
        const data = res.data;
        if (!data.success) throw new Error(data.error || 'Failed to create bucket');
        return data.bucket;
    } catch (err: any) {
        // Extract detail from FastAPI error response
        const detail = err?.response?.data?.detail;
        throw new Error(detail || err.message || 'Failed to create bucket');
    }
}

// ── Vercel Project Picker ──────────────────────────────────────────────
export async function fetchVercelProjects(accountId: string): Promise<{ id: string; name: string }[]> {
    const res = await api.get(`/api/storage/vercel-projects?account_id=${accountId}`);
    return res.data;
}

export async function createVercelProject(accountId: string, name: string): Promise<{ id: string; name: string }> {
    const res = await api.post('/api/storage/vercel-projects', { account_id: accountId, name });
    return res.data;
}

export async function updateBucket(
    providerId: string,
    id: string,
    isPublic: boolean,
    fileSizeLimit?: number,
    allowedMimeTypes?: string[]
) {
    const res = await api.put(`/api/storage/buckets/${id}?provider_id=${providerId}`, {
        public: isPublic,
        file_size_limit: fileSizeLimit,
        allowed_mime_types: allowedMimeTypes,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to update bucket');
    return data;
}

export async function deleteBucket(providerId: string, id: string) {
    const res = await api.delete(`/api/storage/buckets/${id}?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to delete bucket');
}

export async function emptyBucket(providerId: string, id: string) {
    const res = await api.post(`/api/storage/buckets/${id}/empty?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to empty bucket');
}

export interface FetchBucketsResult {
    buckets: Bucket[];
    permissionWarning?: string;
}

export async function fetchBuckets(providerId: string): Promise<FetchBucketsResult> {
    const res = await api.get(`/api/storage/buckets?provider_id=${providerId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch buckets');
    return {
        buckets: data.buckets,
        permissionWarning: data.permission_warning,
    };
}

export async function fetchFiles(
    providerId: string,
    bucket: string,
    path?: string,
    page: number = 0,
    limit: number = 10,
    search?: string,
    sortBy?: string,
    sortOrder?: string
): Promise<StorageFile[]> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('bucket', bucket);
    if (path) params.set('path', path);
    params.set('limit', limit.toString());
    params.set('offset', (page * limit).toString());
    if (search) params.set('search', search);
    if (sortBy) params.set('sort_by', sortBy);
    if (sortOrder) params.set('sort_order', sortOrder);

    const res = await api.get(`/api/storage/list?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch files');
    return data.files;
}

export async function deleteFile(providerId: string, paths: string[], bucket?: string): Promise<void> {
    const res = await api.delete('/api/storage/delete', {
        data: { paths, bucket, provider_id: providerId },
    });
    const data = res.data;
    if (!data.success) {
        throw new Error(data.error || 'Failed to delete');
    }
}

export async function getSignedUrl(providerId: string, path: string, bucket: string, expiresIn: number = 3600): Promise<string> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('path', path);
    params.set('bucket', bucket);
    params.set('expiresIn', String(expiresIn));

    const res = await api.get(`/api/storage/signed-url?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.signedUrl;
}

export async function getPublicUrl(providerId: string, path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('provider_id', providerId);
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await api.get(`/api/storage/public-url?${params.toString()}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.publicUrl;
}

export async function uploadFile(
    providerId: string,
    file: File,
    path?: string,
    bucket?: string
): Promise<{ path: string; publicUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('provider_id', providerId);
    if (path) formData.append('path', path);
    if (bucket) formData.append('bucket', bucket);

    const res = await api.post('/api/storage/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to upload');
    return { path: data.path, publicUrl: data.publicUrl };
}

export async function createFolder(providerId: string, folderPath: string, bucket: string): Promise<void> {
    const res = await api.post('/api/storage/create-folder', { folderPath, bucket, provider_id: providerId });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to create folder');
}

export async function moveFile(
    providerId: string,
    sourceKey: string,
    destinationKey: string,
    options?: { sourceBucket?: string; destBucket?: string }
): Promise<void> {
    const res = await api.post('/api/storage/move', {
        sourceKey,
        destinationKey,
        sourceBucket: options?.sourceBucket,
        destBucket: options?.destBucket,
        provider_id: providerId,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to move/rename');
}

/**
 * Move a file across buckets / providers (Sprint 4B + Post-sprint 2.2).
 *
 * Small files (< 50 MB) are moved synchronously and return `{ bytes }`.
 * Large files are moved by a background job — the response then carries
 * `{ async: true, jobId, bytesTotal }` and the caller polls `getMoveStatus`
 * until `status` is `completed` or `failed`.
 */
export async function moveFileCross(params: {
    sourceProviderId: string;
    sourceBucket: string;
    sourceKey: string;
    destProviderId: string;
    destBucket: string;
    destKey: string;
}): Promise<{ bytes: number; async?: boolean; jobId?: string; bytesTotal?: number }> {
    const res = await api.post('/api/storage/move-cross', {
        source_provider_id: params.sourceProviderId,
        source_bucket: params.sourceBucket,
        source_key: params.sourceKey,
        dest_provider_id: params.destProviderId,
        dest_bucket: params.destBucket,
        dest_key: params.destKey,
    });
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to move file across providers');
    return {
        bytes: data.bytes ?? 0,
        async: data.async === true ? true : undefined,
        jobId: data.job_id,
        bytesTotal: data.bytes_total,
    };
}

export interface MoveJobStatus {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    phase?: string | null;
    bytesTotal: number;
    bytesTransferred: number;
    progress: number; // 0..1
    error?: string | null;
}

/**
 * Poll the status of a background cross-bucket move (Post-sprint 2.2).
 */
export async function getMoveStatus(jobId: string): Promise<MoveJobStatus> {
    const res = await api.get(`/api/storage/move-status/${jobId}`);
    const data = res.data;
    if (!data.success) throw new Error(data.error || 'Failed to fetch move status');
    return {
        status: data.status,
        phase: data.phase,
        bytesTotal: data.bytes_total ?? 0,
        bytesTransferred: data.bytes_transferred ?? 0,
        progress: typeof data.progress === 'number' ? data.progress : 0,
        error: data.error,
    };
}

