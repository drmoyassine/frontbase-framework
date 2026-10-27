// FileBrowser Utilities

import { Image, Film, Music, FileText, File } from 'lucide-react';

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getFileIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return Image;
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return Film;
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return Music;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
    return File;
}

/** Check if file is an image type that can be previewed */
export function isImageFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext);
}
