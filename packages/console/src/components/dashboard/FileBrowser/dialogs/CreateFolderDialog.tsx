// CreateFolderDialog — Dialog for creating a new folder

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderName: string;
    onFolderNameChange: (name: string) => void;
    onSubmit: () => void;
    isPending?: boolean;
}

export function CreateFolderDialog({ open, onOpenChange, folderName, onFolderNameChange, onSubmit, isPending }: CreateFolderDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>Enter a name for the new folder.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="folderName">Folder Name</Label>
                        <Input
                            id="folderName"
                            value={folderName}
                            onChange={(e) => onFolderNameChange(e.target.value)}
                            placeholder="e.g., images"
                            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onSubmit} disabled={!folderName.trim() || isPending}>
                        {isPending ? 'Creating...' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
