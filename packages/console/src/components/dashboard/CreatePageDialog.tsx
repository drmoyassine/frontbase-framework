import React, { useState, useEffect, useRef } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { getDefaultPageStyles } from '@/lib/styles/defaults';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { PageExportEnvelope, validatePageExport } from '@/types/page-export';

interface CreatePageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPageCreated: (pageId: string) => void;
}

interface ImportFileEntry {
    id: string;
    fileName: string;
    data: PageExportEnvelope;
    name: string;
    slug: string;
    error: string;
    status: 'ready' | 'importing' | 'done' | 'failed';
}

export const CreatePageDialog: React.FC<CreatePageDialogProps> = ({
    open,
    onOpenChange,
    onPageCreated,
}) => {
    const pages = useBuilderStore(s => s.pages);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('create');

    // Multi-import state
    const [importFiles, setImportFiles] = useState<ImportFileEntry[]>([]);
    const [importError, setImportError] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-generate slug from name
    useEffect(() => {
        if (name) {
            const generatedSlug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            setSlug(generatedSlug);
        }
    }, [name]);

    const validateSlug = (slugToCheck: string = slug) => {
        if (!slugToCheck) {
            setError('Slug is required');
            return false;
        }

        // Check for slug uniqueness
        const existingSlugs = new Set(pages.map(p => p.slug));
        if (existingSlugs.has(slugToCheck)) {
            setError('A page with this slug already exists');
            return false;
        }

        // Validate slug format
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugToCheck)) {
            setError('Slug must contain only lowercase letters, numbers, and hyphens');
            return false;
        }

        setError('');
        return true;
    };

    const handleCreate = async () => {
        if (!name) {
            setError('Page name is required');
            return;
        }

        if (!validateSlug()) {
            return;
        }

        setIsCreating(true);
        setError('');

        try {
            const { createPageInDatabase } = useBuilderStore.getState();

            const pageData = {
                name,
                slug,
                title: name,
                description: 'A new page created with Frontbase',
                keywords: '',
                isPublic: true,
                isHomepage: false,
                containerStyles: getDefaultPageStyles(),
                layoutData: {
                    content: [], // Start with empty canvas
                    root: {}
                }
            };

            const newPageId = await createPageInDatabase(pageData);

            if (newPageId) {
                onPageCreated(newPageId);
                onOpenChange(false);
                // Reset form
                setName('');
                setSlug('');
                setError('');
            } else {
                throw new Error('Failed to create page');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create page');
        } finally {
            setIsCreating(false);
        }
    };

    // --- Multi-Import Logic ---

    const generateUniqueSlug = (baseSlug: string, existingSlugs: Set<string>, pendingSlugs: Set<string>): string => {
        let candidate = baseSlug;
        let counter = 2;
        while (existingSlugs.has(candidate) || pendingSlugs.has(candidate)) {
            candidate = `${baseSlug}-${counter}`;
            counter++;
        }
        return candidate;
    };

    const processImportFiles = (files: FileList | File[]) => {
        setImportError('');
        const existingSlugs = new Set(pages.map(p => p.slug));
        const pendingSlugs = new Set(importFiles.map(f => f.slug));

        const fileArray = Array.from(files);
        const validFiles = fileArray.filter(
            f => f.name.endsWith('.json') || f.name.endsWith('.frontbase.json')
        );

        if (validFiles.length === 0) {
            setImportError('No valid .json or .frontbase.json files found');
            return;
        }

        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target?.result as string);
                    const validationError = validatePageExport(parsed);
                    if (validationError) {
                        setImportFiles(prev => [...prev, {
                            id: crypto.randomUUID(),
                            fileName: file.name,
                            data: parsed,
                            name: file.name,
                            slug: '',
                            error: validationError,
                            status: 'failed',
                        }]);
                        return;
                    }

                    const envelope = parsed as PageExportEnvelope;
                    const baseSlug = envelope.page.slug;
                    const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs, pendingSlugs);
                    pendingSlugs.add(uniqueSlug);

                    setImportFiles(prev => [...prev, {
                        id: crypto.randomUUID(),
                        fileName: file.name,
                        data: envelope,
                        name: envelope.page.name,
                        slug: uniqueSlug,
                        error: '',
                        status: 'ready',
                    }]);
                } catch {
                    setImportFiles(prev => [...prev, {
                        id: crypto.randomUUID(),
                        fileName: file.name,
                        data: null as any,
                        name: file.name,
                        slug: '',
                        error: 'Failed to parse JSON',
                        status: 'failed',
                    }]);
                }
            };
            reader.readAsText(file);
        });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) processImportFiles(files);
        // Reset input so the same file(s) can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) processImportFiles(files);
    };

    const removeImportFile = (id: string) => {
        setImportFiles(prev => prev.filter(f => f.id !== id));
    };

    const updateImportFile = (id: string, updates: Partial<ImportFileEntry>) => {
        setImportFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleImport = async () => {
        const readyFiles = importFiles.filter(f => f.status === 'ready');
        if (readyFiles.length === 0) return;

        // Validate all slugs before starting
        const existingSlugs = new Set(pages.map(p => p.slug));
        const seenSlugs = new Set<string>();
        let hasErrors = false;

        for (const file of readyFiles) {
            if (!file.slug) {
                updateImportFile(file.id, { error: 'Slug is required' });
                hasErrors = true;
                continue;
            }
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(file.slug)) {
                updateImportFile(file.id, { error: 'Invalid slug format' });
                hasErrors = true;
                continue;
            }
            if (existingSlugs.has(file.slug) || seenSlugs.has(file.slug)) {
                updateImportFile(file.id, { error: 'Duplicate slug' });
                hasErrors = true;
                continue;
            }
            seenSlugs.add(file.slug);
        }

        if (hasErrors) return;

        setIsImporting(true);
        setImportProgress({ current: 0, total: readyFiles.length });

        const { createPageInDatabase } = useBuilderStore.getState();
        let lastCreatedId: string | null = null;

        for (let i = 0; i < readyFiles.length; i++) {
            const file = readyFiles[i];
            updateImportFile(file.id, { status: 'importing', error: '' });
            setImportProgress({ current: i + 1, total: readyFiles.length });

            try {
                const pageData = {
                    name: file.name,
                    slug: file.slug,
                    title: file.data.page.title || file.name,
                    description: file.data.page.description || '',
                    keywords: file.data.page.keywords || '',
                    isPublic: true,
                    isHomepage: false,
                    containerStyles: file.data.page.containerStyles || getDefaultPageStyles(),
                    layoutData: file.data.page.layoutData || { content: [], root: {} },
                };

                const newPageId = await createPageInDatabase(pageData);

                if (newPageId) {
                    lastCreatedId = newPageId;
                    updateImportFile(file.id, { status: 'done' });
                } else {
                    updateImportFile(file.id, { status: 'failed', error: 'Failed to create page' });
                }
            } catch (err) {
                updateImportFile(file.id, {
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Import failed',
                });
            }
        }

        setIsImporting(false);

        // Close dialog and navigate to last created page

        if (lastCreatedId) {
            onPageCreated(lastCreatedId);
            // Small delay to let the user see completion
            setTimeout(() => {
                onOpenChange(false);
                resetForm();
            }, 600);
        }
    };

    const resetForm = () => {
        setName('');
        setSlug('');
        setError('');
        setActiveTab('create');
        setImportFiles([]);
        setImportError('');
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0 });
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
    };

    const readyCount = importFiles.filter(f => f.status === 'ready').length;
    const doneCount = importFiles.filter(f => f.status === 'done').length;
    const failedCount = importFiles.filter(f => f.status === 'failed').length;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>New Page</DialogTitle>
                    <DialogDescription>
                        Create a blank page or import from previously exported files.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="create">Create</TabsTrigger>
                        <TabsTrigger value="import">Import</TabsTrigger>
                    </TabsList>

                    {/* --- Create Tab (original form) --- */}
                    <TabsContent value="create" className="mt-4">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Page Name</Label>
                                <Input
                                    id="name"
                                    placeholder="My New Page"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={isCreating}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="slug">Slug</Label>
                                <Input
                                    id="slug"
                                    placeholder="my-new-page"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    onBlur={() => validateSlug()}
                                    disabled={isCreating}
                                />
                                <p className="text-sm text-muted-foreground">
                                    URL: /{slug || 'your-slug'}
                                </p>
                            </div>

                            {error && (
                                <div className="text-sm text-destructive">
                                    {error}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="mt-6">
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={isCreating}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleCreate} disabled={isCreating}>
                                {isCreating ? 'Creating...' : 'Create Page'}
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    {/* --- Import Tab (multi-file) --- */}
                    <TabsContent value="import" className="mt-4">
                        <div className="grid gap-4">
                            {/* Drop zone — always visible for adding more files */}
                            <div
                                className={`
                                    border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                                    transition-colors duration-200
                                    ${isDragging
                                        ? 'border-primary bg-primary/5'
                                        : 'border-muted-foreground/25 hover:border-primary/50'
                                    }
                                    ${importFiles.length > 0 ? 'py-4' : 'py-8'}
                                `}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                            >
                                <Upload className={`mx-auto text-muted-foreground mb-2 ${importFiles.length > 0 ? 'h-5 w-5' : 'h-8 w-8 mb-3'}`} />
                                <p className="text-sm font-medium">
                                    {importFiles.length > 0
                                        ? 'Drop more files or click to add'
                                        : <>Drop <code>.frontbase.json</code> files here</>
                                    }
                                </p>
                                {importFiles.length === 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Select multiple files for batch import
                                    </p>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                            </div>

                            {/* File list */}
                            {importFiles.length > 0 && (
                                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                                    {importFiles.map((file) => (
                                        <div
                                            key={file.id}
                                            className={`rounded-lg border p-3 space-y-2 transition-colors ${
                                                file.status === 'done'
                                                    ? 'bg-green-500/5 border-green-500/30'
                                                    : file.status === 'failed'
                                                    ? 'bg-destructive/5 border-destructive/30'
                                                    : file.status === 'importing'
                                                    ? 'bg-primary/5 border-primary/30'
                                                    : 'bg-muted/50'
                                            }`}
                                        >
                                            {/* Header row */}
                                            <div className="flex items-center gap-2">
                                                {file.status === 'done' ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                                ) : file.status === 'failed' ? (
                                                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                                                ) : file.status === 'importing' ? (
                                                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                                                ) : (
                                                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                )}
                                                <span className="text-sm font-medium truncate flex-1">
                                                    {file.name}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground shrink-0">
                                                    /{file.slug}
                                                </span>
                                                {file.status === 'ready' && !isImporting && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 w-5 p-0 shrink-0"
                                                        onClick={() => removeImportFile(file.id)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>

                                            {/* Editable slug — only when ready and not importing */}
                                            {file.status === 'ready' && !isImporting && (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={file.slug}
                                                        onChange={(e) => updateImportFile(file.id, { slug: e.target.value, error: '' })}
                                                        className="h-7 text-xs"
                                                        placeholder="page-slug"
                                                    />
                                                </div>
                                            )}

                                            {/* Error */}
                                            {file.error && (
                                                <p className="text-xs text-destructive">{file.error}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Progress bar */}
                            {isImporting && importProgress.total > 0 && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Importing pages...</span>
                                        <span>{importProgress.current} / {importProgress.total}</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-1.5">
                                        <div
                                            className="bg-primary rounded-full h-1.5 transition-all duration-300"
                                            style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Summary after completion */}
                            {!isImporting && doneCount > 0 && (
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>{doneCount} page{doneCount !== 1 ? 's' : ''} imported successfully{failedCount > 0 ? `, ${failedCount} failed` : ''}</span>
                                </div>
                            )}

                            {/* Global error */}
                            {importError && (
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{importError}</span>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="mt-6">
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={isImporting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={isImporting || readyCount === 0}
                            >
                                {isImporting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Importing...
                                    </>
                                ) : readyCount === 0 ? (
                                    'Import Pages'
                                ) : readyCount === 1 ? (
                                    'Import 1 Page'
                                ) : (
                                    `Import ${readyCount} Pages`
                                )}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
