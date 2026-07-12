/**
 * File Storage — bucket + file management.
 * CF-18 Phase 2. CRUD over /api/console/storage/*.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Folder, File } from 'lucide-react';

interface Bucket {
    id: string;
    name: string;
    provider: string;
    config: string | null;
    created_at: string;
}

interface StoredFile {
    id: string;
    bucket_id: string;
    path: string;
    name: string;
    size: number;
    mime_type: string | null;
    created_at: string;
}

export function Storage() {
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [files, setFiles] = useState<StoredFile[]>([]);
    const [showBucketForm, setShowBucketForm] = useState(false);
    const [bucketForm, setBucketForm] = useState({ id: '', name: '', provider: 'local', config: '' });
    const [uploadPath, setUploadPath] = useState('');
    const [uploadName, setUploadName] = useState('');
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const loadBuckets = () => api<{ buckets: Bucket[] }>('/storage/buckets')
        .then((r) => setBuckets(r.buckets ?? []))
        .catch(() => setBuckets([]));

    useEffect(() => { loadBuckets(); }, []);

    const openBucket = async (id: string) => {
        setSelected(id);
        const { files: fs } = await api<{ files: StoredFile[] }>(`/storage/buckets/${id}/files`);
        setFiles(fs ?? []);
    };

    const createBucket = async () => {
        if (!bucketForm.id || !bucketForm.name) { setMsg({ kind: 'err', text: 'ID + name required' }); return; }
        setMsg(null);
        try {
            await api(`/storage/buckets/${bucketForm.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name: bucketForm.name, provider: bucketForm.provider, config: bucketForm.config || undefined }),
            });
            setShowBucketForm(false);
            setBucketForm({ id: '', name: '', provider: 'local', config: '' });
            await loadBuckets();
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        }
    };

    const deleteBucket = async (id: string) => {
        await api(`/storage/buckets/${id}`, { method: 'DELETE' });
        if (selected === id) setSelected(null);
        await loadBuckets();
    };

    const uploadFile = async () => {
        if (!selected || !uploadPath || !uploadName) return;
        setMsg(null);
        try {
            await api(`/storage/buckets/${selected}/files`, {
                method: 'POST',
                body: JSON.stringify({ path: uploadPath, name: uploadName }),
            });
            setUploadPath(''); setUploadName('');
            await openBucket(selected);
        } catch (e) {
            setMsg({ kind: 'err', text: e instanceof ApiError ? e.code : 'failed' });
        }
    };

    const deleteFile = async (id: string) => {
        await api(`/storage/files/${id}`, { method: 'DELETE' });
        if (selected) await openBucket(selected);
    };

    const fmtSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">File Storage</h1>
                    <p className="text-muted-foreground">Buckets and files for your tenant.</p>
                </div>
                <Button onClick={() => setShowBucketForm(!showBucketForm)}><Plus className="mr-2 h-4 w-4" />New bucket</Button>
            </div>

            {msg && <div className={msg.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</div>}

            {showBucketForm && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">New bucket</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <div><Label className="text-xs">ID</Label><Input value={bucketForm.id} onChange={(e) => setBucketForm({ ...bucketForm, id: e.target.value })} /></div>
                        <div><Label className="text-xs">Name</Label><Input value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} /></div>
                        <div><Label className="text-xs">Provider</Label><Input value={bucketForm.provider} onChange={(e) => setBucketForm({ ...bucketForm, provider: e.target.value })} /></div>
                        <div><Label className="text-xs">Config (JSON)</Label><Input value={bucketForm.config} onChange={(e) => setBucketForm({ ...bucketForm, config: e.target.value })} /></div>
                        <div className="md:col-span-2"><Button onClick={createBucket}>Create</Button></div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <Card>
                    <CardHeader><CardTitle className="text-sm">Buckets</CardTitle></CardHeader>
                    <CardContent className="space-y-1 p-3">
                        {buckets.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">No buckets.</p>}
                        {buckets.map((b) => (
                            <div key={b.id} className="flex items-center gap-2">
                                <button onClick={() => openBucket(b.id)} className={`flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${selected === b.id ? 'bg-accent font-medium' : ''}`}>
                                    <Folder className="h-4 w-4 text-primary" />
                                    <span className="truncate">{b.name}</span>
                                </button>
                                <Button variant="ghost" size="sm" onClick={() => deleteBucket(b.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-sm">{selected ? 'Files' : 'Select a bucket'}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {selected && (
                            <div className="flex gap-2">
                                <Input value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} placeholder="path/to/file" className="flex-1" />
                                <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="filename" className="flex-1" />
                                <Button onClick={uploadFile}><Plus className="mr-1 h-3 w-3" />Add</Button>
                            </div>
                        )}
                        <div className="space-y-1">
                            {files.length === 0 && selected && <p className="text-sm text-muted-foreground">No files.</p>}
                            {files.map((f) => (
                                <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                    <File className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1 truncate">{f.name}</span>
                                    <span className="text-xs text-muted-foreground">{f.path}</span>
                                    <Badge variant="outline" className="text-[10px]">{fmtSize(f.size)}</Badge>
                                    <Button variant="ghost" size="sm" onClick={() => deleteFile(f.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
