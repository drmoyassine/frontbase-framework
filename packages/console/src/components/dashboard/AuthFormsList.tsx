import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, FileKey } from 'lucide-react';
import { useAuthForms } from '@/hooks/useAuthForms';
import { AuthFormBuilder } from './AuthFormBuilder';
import { EmbedCodeDialog } from './EmbedCodeDialog';
import { AuthForm } from '@/types/auth-form';
import { AuthFormCard } from './AuthFormCard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function AuthFormsList() {
    const { forms, loading, createForm, updateForm, deleteForm, setPrimary } = useAuthForms();
    const [editingForm, setEditingForm] = useState<AuthForm | null>(null);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [embedForm, setEmbedForm] = useState<AuthForm | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleCreate = () => {
        setEditingForm(null);
        setIsBuilderOpen(true);
    };

    const handleEdit = (form: AuthForm) => {
        setEditingForm(form);
        setIsBuilderOpen(true);
    };

    const handleSave = async (data: Partial<AuthForm>) => {
        if (editingForm) {
            await updateForm(editingForm.id, data);
        } else {
            await createForm(data);
        }
    };

    const handleDelete = async () => {
        if (deleteId) {
            await deleteForm(deleteId);
            setDeleteId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium">Authentication Forms</h3>
                    <p className="text-sm text-muted-foreground">
                        Create embeddable login and signup forms for your users.
                    </p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Form
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {forms.map(form => (
                    <AuthFormCard
                        key={form.id}
                        form={form}
                        onEdit={handleEdit}
                        onDelete={(id) => setDeleteId(id)}
                        onEmbed={setEmbedForm}
                        onSetPrimary={setPrimary}
                    />
                ))}

                {forms.length === 0 && !loading && (
                    <div className="col-span-full border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-muted-foreground">
                        <FileKey className="h-10 w-10 mb-4 opacity-50" />
                        <p>No forms created yet.</p>
                        <Button variant="link" onClick={handleCreate}>Create your first form</Button>
                    </div>
                )}
            </div>

            <AuthFormBuilder
                form={editingForm}
                open={isBuilderOpen}
                onOpenChange={setIsBuilderOpen}
                onSave={handleSave}
            />

            <EmbedCodeDialog
                form={embedForm}
                open={!!embedForm}
                onOpenChange={(open) => !open && setEmbedForm(null)}
            />

            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. Any websites embedding this form will stop working.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
