// MoveDialog — Dialog for moving files between buckets/folders

import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { HardDrive, Folder, ArrowLeft } from 'lucide-react';
import { Bucket } from '../types';
import { fetchFiles } from '../api';

interface MoveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storageProviderId: string;
    moveTargets: string[];
    buckets: Bucket[] | undefined;
    destBucket: string | null;
    destPath: string;
    onDestBucketChange: (bucket: string) => void;
    onDestPathChange: (path: string) => void;
    onSubmit: () => void;
    isPending?: boolean;
}

export function MoveDialog({
    open,
    onOpenChange,
    storageProviderId,
    moveTargets,
    buckets,
    destBucket,
    destPath,
    onDestBucketChange,
    onDestPathChange,
    onSubmit,
    isPending,
}: MoveDialogProps) {
    const { data: destFolders, isLoading: destFoldersLoading } = useQuery({
        queryKey: ['storage-files', storageProviderId, destBucket, destPath, 'folders-only'],
        queryFn: async () => {
            const files = await fetchFiles(storageProviderId, destBucket!, destPath || undefined, 0, 100);
            return files.filter((f) => f.isFolder);
        },
        enabled: open && !!destBucket,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Move {moveTargets.length} items</DialogTitle>
                    <DialogDescription>Select destination bucket and folder.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Destination Bucket</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {buckets?.map((b) => (
                                <Button
                                    key={b.id}
                                    variant={destBucket === b.name ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => { onDestBucketChange(b.name); onDestPathChange(''); }}
                                    className="justify-start truncate"
                                >
                                    <HardDrive className="h-4 w-4 mr-2 flex-shrink-0" /> {b.name}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {destBucket && (
                        <div className="space-y-2 border rounded-md p-3 max-h-[250px] overflow-y-auto">
                            <Label className="text-xs text-muted-foreground uppercase">Path: {destPath || 'Root'}</Label>
                            <div className="space-y-1">
                                {destPath && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start text-blue-500"
                                        onClick={() => {
                                            const parts = destPath.split('/');
                                            parts.pop();
                                            onDestPathChange(parts.join('/'));
                                        }}
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                                    </Button>
                                )}
                                {destFoldersLoading ? (
                                    <div className="p-2 space-y-2">
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="h-8 w-full" />
                                    </div>
                                ) : destFolders && destFolders.length > 0 ? (
                                    destFolders.map((folder) => (
                                        <Button
                                            key={folder.name}
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start"
                                            onClick={() => onDestPathChange(destPath ? `${destPath}/${folder.name}` : folder.name)}
                                        >
                                            <Folder className="h-4 w-4 mr-2 text-blue-500 fill-blue-500/20" /> {folder.name}
                                        </Button>
                                    ))
                                ) : (
                                    <p className="text-xs text-muted-foreground p-2">No subfolders</p>
                                )}
                                <p className="text-xs text-muted-foreground italic px-2 py-1 border-t mt-2 pt-2">
                                    Moving to: {destPath || 'Root'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onSubmit} disabled={!destBucket || isPending}>
                        {isPending ? 'Moving...' : 'Move Here'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
