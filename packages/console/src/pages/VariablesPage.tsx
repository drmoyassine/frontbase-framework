import React, { useEffect, useState } from 'react';
import { useBuilderStore, AppVariable } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Edit, RefreshCw } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function VariablesPage() {
    const {
        appVariables,
        loadVariablesFromDatabase,
        addAppVariable,
        updateAppVariable,
        deleteAppVariable,
        isSaving
    } = useBuilderStore(useShallow(s => ({
        appVariables: s.appVariables,
        loadVariablesFromDatabase: s.loadVariablesFromDatabase,
        addAppVariable: s.addAppVariable,
        updateAppVariable: s.updateAppVariable,
        deleteAppVariable: s.deleteAppVariable,
        isSaving: s.isSaving
    })));

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingVariable, setEditingVariable] = useState<AppVariable | null>(null);
    const [formData, setFormData] = useState<Partial<AppVariable>>({
        name: '',
        type: 'variable',
        value: '',
        description: ''
    });

    useEffect(() => {
        loadVariablesFromDatabase();
    }, [loadVariablesFromDatabase]);

    const handleOpenDialog = (variable?: AppVariable) => {
        if (variable) {
            setEditingVariable(variable);
            setFormData({
                name: variable.name,
                type: variable.type,
                value: variable.value || '',
                formula: variable.formula || '',
                description: variable.description || ''
            });
        } else {
            setEditingVariable(null);
            setFormData({
                name: '',
                type: 'variable',
                value: '',
                description: ''
            });
        }
        setIsDialogOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name) return;

        try {
            if (editingVariable) {
                await updateAppVariable(editingVariable.id, formData);
            } else {
                await addAppVariable(formData as any);
            }
            setIsDialogOpen(false);
        } catch (error) {
            console.error('Failed to save variable:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this variable?')) {
            await deleteAppVariable(id);
        }
    };

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">App Variables</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage global variables and calculated values for your application.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => loadVariablesFromDatabase()} disabled={isSaving}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isSaving ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Variable
                    </Button>
                </div>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Value / Formula</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {appVariables.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No variables found. Create one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            appVariables.map((variable) => (
                                <TableRow key={variable.id}>
                                    <TableCell className="font-medium">{variable.name}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded-full text-xs ${variable.type === 'calculated'
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                            }`}>
                                            {variable.type}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {variable.type === 'calculated' ? variable.formula : variable.value}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{variable.description}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(variable)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(variable.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingVariable ? 'Edit Variable' : 'Create Variable'}</DialogTitle>
                        <DialogDescription>
                            Define a global variable that can be used across your application.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., currentUser, themeColor"
                                    required
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="type">Type</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(value: 'variable' | 'calculated') =>
                                        setFormData({ ...formData, type: value })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="variable">Static Variable</SelectItem>
                                        <SelectItem value="calculated">Calculated Formula</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {formData.type === 'variable' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="value">Value</Label>
                                    <Input
                                        id="value"
                                        value={formData.value}
                                        onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                        placeholder="Enter value..."
                                    />
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    <Label htmlFor="formula">Formula</Label>
                                    <Textarea
                                        id="formula"
                                        value={formData.formula}
                                        onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                                        placeholder="e.g., {{variable1}} + {{variable2}}"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Use double curly braces to reference other variables.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="description">Description (Optional)</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Describe what this variable is used for..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? 'Saving...' : (editingVariable ? 'Update' : 'Create')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
