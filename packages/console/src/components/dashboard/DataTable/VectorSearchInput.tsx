/**
 * VectorSearchInput (Sprint 4C) — semantic search box for the DataTable.
 *
 * Calls POST /api/vector/search with the active datasource's vector config and
 * surfaces the ranked rows. Drop into a DataTable toolbar; results are returned
 * to the parent via onResults so the table can highlight/filter them.
 *
 * Requires a configured embedding endpoint + a vector column on the table
 * (managed via /api/vector/upsert). See docs/sprint4.md §4C.
 */
import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import api from '@/services/api-service';

export interface VectorSearchResult {
    id: unknown;
    _score?: number;
    [key: string]: unknown;
}

export interface VectorSearchConfig {
    provider?: string;        // default 'pgvector'
    dsn?: string;             // target datasource DSN (pgvector)
    table: string;
    column?: string;          // default 'embedding'
    topK?: number;
    embedding: {
        base_url: string;
        api_key?: string;
        model?: string;
        dimensions?: number;
    };
}

interface VectorSearchInputProps {
    config: VectorSearchConfig;
    onResults: (rows: VectorSearchResult[]) => void;
    placeholder?: string;
}

export function VectorSearchInput({ config, onResults, placeholder }: VectorSearchInputProps) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.post('/api/vector/search', {
                provider: config.provider || 'pgvector',
                dsn: config.dsn,
                table: config.table,
                column: config.column || 'embedding',
                query,
                top_k: config.topK ?? 10,
                embedding: config.embedding,
            });
            onResults(res.data?.results ?? []);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Search failed');
            onResults([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                    placeholder={placeholder || 'Semantic search…'}
                    className="pl-8"
                    disabled={loading}
                />
            </div>
            <Button size="sm" onClick={run} disabled={loading || !query.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
    );
}
