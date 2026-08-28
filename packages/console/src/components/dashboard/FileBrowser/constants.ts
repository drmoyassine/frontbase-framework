// FileBrowser Constants

export const EDGE_API = import.meta.env.VITE_EDGE_API_URL || '';

export const MIME_TYPE_OPTIONS = [
    { label: 'Images (any)', value: 'image/*' },
    { label: 'PNG Image', value: 'image/png' },
    { label: 'JPEG Image', value: 'image/jpeg' },
    { label: 'GIF Image', value: 'image/gif' },
    { label: 'SVG Image', value: 'image/svg+xml' },
    { label: 'WebP Image', value: 'image/webp' },
    { label: 'PDF Document', value: 'application/pdf' },
    { label: 'JSON Data', value: 'application/json' },
    { label: 'Text File', value: 'text/plain' },
    { label: 'HTML File', value: 'text/html' },
    { label: 'CSV File', value: 'text/csv' },
    { label: 'Video (any)', value: 'video/*' },
    { label: 'MP4 Video', value: 'video/mp4' },
    { label: 'Audio (any)', value: 'audio/*' },
    { label: 'MP3 Audio', value: 'audio/mpeg' },
    { label: 'Archive (ZIP)', value: 'application/zip' },
];

export const PAGE_SIZE = 10;
export const BUCKET_PAGE_SIZE = 5;

/** Per-provider capability flags — controls which bucket options are available */
export const PROVIDER_CAPABILITIES: Record<string, {
    supportsPublicBuckets: boolean;
    supportsMaxFileSize: boolean;
    supportsMimeTypeFilter: boolean;
    publicBucketHint?: string;
}> = {
    supabase: {
        supportsPublicBuckets: true,
        supportsMaxFileSize: true,
        supportsMimeTypeFilter: true,
    },
    cloudflare: {
        supportsPublicBuckets: true,
        supportsMaxFileSize: false,
        supportsMimeTypeFilter: false,
        publicBucketHint: 'Requires custom domain for public access',
    },
    vercel: {
        supportsPublicBuckets: true,
        supportsMaxFileSize: false,
        supportsMimeTypeFilter: false,
        publicBucketHint: 'Access mode (public/private) is permanent — set at creation, cannot be changed',
    },
    netlify: {
        supportsPublicBuckets: false,
        supportsMaxFileSize: false,
        supportsMimeTypeFilter: false,
        publicBucketHint: 'Netlify Blobs are private — use signed links to share files',
    },
};

/** Default capabilities for unknown providers */
export const DEFAULT_CAPABILITIES: {
    supportsPublicBuckets: boolean;
    supportsMaxFileSize: boolean;
    supportsMimeTypeFilter: boolean;
    publicBucketHint?: string;
} = {
    supportsPublicBuckets: true,
    supportsMaxFileSize: true,
    supportsMimeTypeFilter: true,
};

/** Expiry options for signed URL link sharing */
export const LINK_EXPIRY_OPTIONS = [
    { label: '15 minutes', value: 900 },
    { label: '1 hour', value: 3600 },
    { label: '6 hours', value: 21600 },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
    { label: '30 days', value: 2592000 },
];

