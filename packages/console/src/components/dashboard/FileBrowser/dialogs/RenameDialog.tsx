// RenameDialog — Dialog for renaming files or folders

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RenameTarget } from '../types';

interface RenameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: RenameTarget | null;
    newName: string;
    onNewNameChange: (name: string) => void;
    onSubmit: () => void;
    isPending?: boolean;
}

export function RenameDialog({ open, onOpenChange, target, newName, onNewNameChange, onSubmit, isPending }: RenameDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename {target?.isFolder ? 'Folder' : 'File'}</DialogTitle>
                    <DialogDescription>Enter a new name for "{target?.name}".</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="newName">New Name</Label>
                        <Input
                            id="newName"
                            value={newName}
                            onChange={(e) => onNewNameChange(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={onSubmit}
                        disabled={!newName.trim() || newName === target?.name || isPending}
                    >
                        {isPending ? 'Renaming...' : 'Rename'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
