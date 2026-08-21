/**
 * Validation + normalization for RPC-shaped data-execute bodies.
 *
 * The client hydration runtime (hydrate.js rH, proxy strategy) rebuilds the
 * request body on every fetch from the baked queryConfig — {table_name,
 * columns, joins, page, page_size, filters, sort_col, sort_dir[, search_query,
 * search_cols]} — and POSTs it to the PUBLIC /api/data/execute. The worker
 * forwards that body to the datasource's frontbase_get_rows /
 * frontbase_search_rows RPC, which splices `columns` and `joins[].on` RAW into
 * dynamic SQL. The product never sees arbitrary bodies here (its requests are
 * baked at publish; captcha/rate-limit optional), so it has no equivalent
 * gate — the framework accepts live-rebuilt bodies and therefore MUST validate
 * them. Everything is allow-list grammar: unknown shapes are rejected, not
 * sanitized.
 */

/** Bare identifier: any run of chars excluding SQL metacharacters (spaces OK —
 *  real table names contain them). No quotes, parens, commas, semicolons. */
const IDENT = /^[^"'`();,]+$/;

/** Quoted-or-bare identifier reference ("a"."b" / "a" / a.b / a). */
const COLREF = /^("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\.?("[^"]+"|[A-Za-z0-9_ .]+)?$/;

/** One segment of the baked columns SQL list: `*`, "T", "T".*, "T"."c", "T"."c" AS "T.c". */
const COLUMN_SEGMENT = /^(?:\*|"[^"]+"(?:\.(?:\*|"[^"]+"))?(?:\s+AS\s+"[^"]+")?)$/;

/** JOIN `on` condition: quoted-or-bare colref = quoted-or-bare colref. */
const JOIN_ON = /^("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\.("[^"]+"|[A-Za-z0-9_ .]+)\s*=\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\.("[^"]+"|[A-Za-z0-9_ .]+)$/;

/** JOIN `table`: fully quoted, or a bare identifier. */
const JOIN_TABLE = /^("[^"]+"|[A-Za-z_][A-Za-z0-9_ -]*)$/;

const JOIN_TYPES = new Set(['left', 'inner', 'right', 'full', 'left outer', 'right outer', 'full outer']);

const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']);

const MAX_PAGE_SIZE = 1000;
const MAX_PAGE = 1_000_000;
const MAX_FILTERS = 50;
const MAX_STR = 1000;

export interface RpcQueryPayload {
    table_name: string;
    columns: string;
    joins: Array<{ type: string; table: string; on: string }>;
    page: number;
    page_size: number;
    filters: unknown[];
    sort_col?: string | null;
    sort_dir?: string | null;
    search_query?: string;
    search_cols?: string[];
}

export type ValidatedRpcQuery =
    | { ok: true; payload: RpcQueryPayload; search: boolean }
    | { ok: false; error: string };

function isScalar(v: unknown): boolean {
    if (v === null) return true;
    if (typeof v === 'string') return v.length <= MAX_STR;
    if (typeof v === 'number') return Number.isFinite(v);
    return typeof v === 'boolean';
}

/**
 * Validate a client-rebuilt RPC body and produce the exact payload to forward
 * to frontbase_get_rows (or frontbase_search_rows when a search_query is set).
 * `search` in the result selects the RPC.
 */
export function validateRpcQueryBody(body: unknown): ValidatedRpcQuery {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'invalid body' };
    }
    const b = body as Record<string, unknown>;

    const table_name = b.table_name;
    if (typeof table_name !== 'string' || !table_name.trim() || table_name.length > 200 || !IDENT.test(table_name)) {
        return { ok: false, error: 'invalid table_name' };
    }

    const columns = b.columns ?? '*';
    if (typeof columns !== 'string' || columns.length > 8000) {
        return { ok: false, error: 'invalid columns' };
    }
    const segments = columns.split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (segments.length === 0 || segments.length > 500 || !segments.every((s) => COLUMN_SEGMENT.test(s))) {
        return { ok: false, error: 'invalid columns' };
    }

    let joins: Array<{ type: string; table: string; on: string }> = [];
    if (b.joins !== undefined && b.joins !== null) {
        if (!Array.isArray(b.joins) || b.joins.length > 20) return { ok: false, error: 'invalid joins' };
        joins = [];
        for (const j of b.joins) {
            if (!j || typeof j !== 'object') return { ok: false, error: 'invalid joins' };
            const { type, table, on } = j as Record<string, unknown>;
            if (typeof type !== 'string' || !JOIN_TYPES.has(type.toLowerCase())) return { ok: false, error: 'invalid join type' };
            if (typeof table !== 'string' || table.length > 200 || !JOIN_TABLE.test(table)) return { ok: false, error: 'invalid join table' };
            if (typeof on !== 'string' || on.length > 500 || !JOIN_ON.test(on)) return { ok: false, error: 'invalid join condition' };
            joins.push({ type: type.toLowerCase(), table, on });
        }
    }

    const page = b.page === undefined || b.page === null ? 1 : b.page;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
        return { ok: false, error: 'invalid page' };
    }
    const page_size = b.page_size === undefined || b.page_size === null ? 20 : b.page_size;
    if (typeof page_size !== 'number' || !Number.isInteger(page_size) || page_size < 1 || page_size > MAX_PAGE_SIZE) {
        return { ok: false, error: 'invalid page_size' };
    }

    let filters: unknown[] = [];
    if (b.filters !== undefined && b.filters !== null) {
        if (!Array.isArray(b.filters) || b.filters.length > MAX_FILTERS) return { ok: false, error: 'invalid filters' };
        for (const f of b.filters) {
            if (!f || typeof f !== 'object') return { ok: false, error: 'invalid filter' };
            const { column, op, filterType, value } = f as Record<string, unknown>;
            if (typeof column !== 'string' || !column.trim() || column.length > 200 || !IDENT.test(column)) {
                return { ok: false, error: 'invalid filter column' };
            }
            if (op !== undefined && (typeof op !== 'string' || !FILTER_OPS.has(op))) {
                return { ok: false, error: 'invalid filter operator' };
            }
            if (filterType !== undefined && (typeof filterType !== 'string' || filterType.length > 64)) {
                return { ok: false, error: 'invalid filterType' };
            }
            if (value !== undefined && value !== null) {
                const okValue = isScalar(value)
                    || (Array.isArray(value) && value.length <= 1000 && value.every(isScalar));
                if (!okValue) return { ok: false, error: 'invalid filter value' };
            }
        }
        filters = b.filters;
    }

    let sort_col: string | null = null;
    if (b.sort_col !== undefined && b.sort_col !== null && b.sort_col !== '') {
        if (typeof b.sort_col !== 'string' || b.sort_col.length > 200 || !COLREF.test(b.sort_col)) {
            return { ok: false, error: 'invalid sort_col' };
        }
        sort_col = b.sort_col;
    }
    let sort_dir: string | null = null;
    if (b.sort_dir !== undefined && b.sort_dir !== null && b.sort_dir !== '') {
        if (typeof b.sort_dir !== 'string' || !['asc', 'desc'].includes(b.sort_dir.toLowerCase())) {
            return { ok: false, error: 'invalid sort_dir' };
        }
        sort_dir = b.sort_dir.toLowerCase();
    }

    // Search: any non-empty search_query routes to frontbase_search_rows.
    let search_query: string | undefined;
    if (typeof b.search_query === 'string' && b.search_query.trim() !== '') {
        if (b.search_query.length > 500) return { ok: false, error: 'invalid search_query' };
        search_query = b.search_query;
    }
    let search_cols: string[] | undefined;
    if (b.search_cols !== undefined && b.search_cols !== null) {
        if (!Array.isArray(b.search_cols) || b.search_cols.length > 100
            || !b.search_cols.every((c) => typeof c === 'string' && c.length > 0 && c.length <= 200 && IDENT.test(c))) {
            return { ok: false, error: 'invalid search_cols' };
        }
        search_cols = b.search_cols as string[];
    }

    const payload: RpcQueryPayload = {
        table_name,
        columns: segments.join(', '),
        joins,
        page,
        page_size,
        filters,
        sort_col,
        sort_dir,
    };
    if (search_query !== undefined) {
        payload.search_query = search_query;
        payload.search_cols = search_cols ?? [];
    }
    return { ok: true, payload, search: search_query !== undefined };
}
