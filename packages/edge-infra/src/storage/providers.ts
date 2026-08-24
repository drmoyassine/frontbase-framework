/**
 * Object storage providers (Phase 3a / F4). S3-compatible — works with Cloudflare
 * R2, AWS S3, Backblaze B2, MinIO, etc. via the `endpoint` + `region` config.
 *
 * Uses @aws-sdk/client-s3, dynamic-imported so the package builds without it and
 * the SDK + credentials only load when storage is actually used (matches the AI/
 * MCP executor pattern). RULE 1: server-only — credentials never enter a browser
 * bundle.
 *
 * RULE 4: provider errors surface opaquely (the caller maps them to a code).
 */
export interface StorageProvider {
    /** Upload bytes. Returns the key stored. */
    put(opts: PutOpts): Promise<{ key: string }>;
    /** Download bytes. */
    get(bucket: string, key: string): Promise<{ bytes: Uint8Array; contentType?: string }>;
    /** Delete an object. */
    delete(bucket: string, key: string): Promise<void>;
    /** A presigned URL for temporary GET access (default 15 min). */
    signedUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;
    /** A presigned URL the client can PUT bytes to directly (F4b, default 15 min). */
    signedUploadUrl(bucket: string, key: string, contentType?: string, expiresInSeconds?: number): Promise<string>;
}

export interface PutOpts {
    bucket: string;
    key: string;
    bytes: Uint8Array;
    contentType?: string;
}

export interface S3StorageOpts {
    /** Access key ID (R2 access key, AWS IAM key, etc.). */
    accessKeyId: string;
    /** Secret access key. */
    secretAccessKey: string;
    /** Endpoint — for R2: https://<accountid>.r2.cloudflarestorage.com */
    endpoint?: string;
    /** Region (R2 uses 'auto'). */
    region?: string;
}

/** Build an S3-compatible StorageProvider. Dynamic-imports @aws-sdk/client-s3. */
export function s3StorageProvider(opts: S3StorageOpts): StorageProvider {
    // Lazy client — the SDK + credentials load on first use, not at import.
    let clientPromise: Promise<unknown> | null = null;
    const getClient = async () => {
        if (clientPromise) return clientPromise;
        clientPromise = (async () => {
            const mod = await import('@aws-sdk/client-s3');
            return new mod.S3Client({
                credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
                endpoint: opts.endpoint,
                region: opts.region ?? 'auto',
            });
        })();
        return clientPromise;
    };

    return {
        async put({ bucket, key, bytes, contentType }: PutOpts): Promise<{ key: string }> {
            const client = await getClient();
            const { PutObjectCommand } = await import('@aws-sdk/client-s3');
            await (client as { send: (c: unknown) => Promise<unknown> }).send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: bytes,
                ContentType: contentType,
            }));
            return { key };
        },

        async get(bucket: string, key: string) {
            const client = await getClient();
            const { GetObjectCommand } = await import('@aws-sdk/client-s3');
            const resp = await (client as { send: (c: unknown) => Promise<{ Body?: { transformToByteArray: () => Promise<Uint8Array> }; ContentType?: string }> }).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            if (!resp.Body) throw new Error('not_found');
            const bytes = await resp.Body.transformToByteArray();
            return { bytes, contentType: resp.ContentType };
        },

        async delete(bucket: string, key: string) {
            const client = await getClient();
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
            await (client as { send: (c: unknown) => Promise<unknown> }).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        },

        async signedUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string> {
            const client = await getClient();
            const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
            const { GetObjectCommand } = await import('@aws-sdk/client-s3');
            // The lazy client is typed as unknown (dynamic import); cast for the signer.
            return getSignedUrl(client as never, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
        },

        async signedUploadUrl(bucket: string, key: string, contentType?: string, expiresInSeconds = 900): Promise<string> {
            const client = await getClient();
            const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
            const { PutObjectCommand } = await import('@aws-sdk/client-s3');
            return getSignedUrl(client as never, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: expiresInSeconds });
        },
    };
}

// ── SigV4 over plain fetch ──────────────────────────────────────────────────
//
// The AWS SDK is not bundleable in every host the framework ships (the cf-full
// Worker artifact stubs @aws-sdk/* to stay under the 1 MB limit), so the S3
// surface needed for CMS byte transfer — PUT/GET/DELETE + presigned GET/PUT —
// is implemented directly against the S3 REST API with Web Crypto HMAC-SHA256.
// Path-style addressing (endpoint/bucket/key) is used throughout: every
// supported S3-compatible host (R2 account endpoints, B2, MinIO, AWS with an
// explicit endpoint) accepts it.
//
// RULE 1: server-only — signing keys never enter a browser bundle.
// RULE 4: errors surface the HTTP status; the caller maps them to a code.

const subtle = globalThis.crypto.subtle;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const hex = (bytes: Uint8Array): string =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (data: Uint8Array | string): Promise<string> =>
    hex(new Uint8Array(await subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data as BufferSource)));

const hmac = async (key: Uint8Array | string, data: string): Promise<Uint8Array> =>
    new Uint8Array(await subtle.sign(
        'HMAC',
        await subtle.importKey(
            'raw',
            typeof key === 'string' ? new TextEncoder().encode(key) : key as BufferSource,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        ),
        new TextEncoder().encode(data),
    ));

/** AWS `uriEncode`: percent-encode everything except A–Za–z0-9-._~ (and `/` when keepSlash). */
const uriEncode = (value: string, keepSlash = false): string => {
    let out = '';
    for (const ch of value) {
        if (/[A-Za-z0-9-._~]/.test(ch) || (keepSlash && ch === '/')) out += ch;
        else for (const byte of new TextEncoder().encode(ch)) out += '%' + byte.toString(16).toUpperCase();
    }
    return out;
};

interface SigV4Context {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    region: string;
}

/** The SigV4 signing key chain — HMAC(secret, date) → region → service → terminator. */
const signingKey = async (ctx: SigV4Context, dateStamp: string): Promise<Uint8Array> =>
    hmac(await hmac(await hmac(await hmac('AWS4' + ctx.secretAccessKey, dateStamp), ctx.region), 's3'), 'aws4_request');

interface SignArgs {
    method: string;
    /** Canonical path — already `/bucket/key` with the key URI-encoded (slashes kept). */
    canonicalPath: string;
    /** Query params (unencoded keys/values) — signed verbatim, sorted canonically. */
    query?: Array<[string, string]>;
    payloadHash: string;
    /** Extra headers to send AND sign (e.g. content-type). Host/x-amz-* are added here. */
    headers?: Record<string, string>;
}

const sign = async (ctx: SigV4Context, args: SignArgs): Promise<{ url: string; headers: Record<string, string> }> => {
    const base = new URL(ctx.endpoint);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260824T101112Z
    const dateStamp = amzDate.slice(0, 8);
    const headersIn: Record<string, string> = { host: base.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': args.payloadHash, ...(args.headers ?? {}) };
    const headerNames = Object.keys(headersIn).sort();
    const canonicalHeaders = headerNames.map((n) => `${n}:${headersIn[n]}\n`).join('');
    const signedHeaders = headerNames.join(';');
    const canonicalQuery = [...(args.query ?? [])]
        .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
        .sort(([ak, av], [bk, bv]) => ak === bk ? (av < bv ? -1 : 1) : (ak < bk ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
    const canonicalRequest = [args.method, args.canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, args.payloadHash].join('\n');
    const scope = `${dateStamp}/${ctx.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
    const signature = hex(await hmac(await signingKey(ctx, dateStamp), stringToSign));
    const requestHeaders: Record<string, string> = {
        ...headersIn,
        Authorization: `AWS4-HMAC-SHA256 Credential=${ctx.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    delete requestHeaders.host; // fetch derives it from the URL — must not be set manually
    const search = canonicalQuery ? `?${canonicalQuery}` : '';
    return { url: `${base.origin}${args.canonicalPath}${search}`, headers: requestHeaders };
};

/** Query-string (presigned) variant — credentials in the URL, no Authorization header. */
const presign = async (
    ctx: SigV4Context,
    method: 'GET' | 'PUT',
    canonicalPath: string,
    expiresInSeconds: number,
): Promise<string> => {
    const base = new URL(ctx.endpoint);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${ctx.region}/s3/aws4_request`;
    const query: Array<[string, string]> = [
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${ctx.accessKeyId}/${scope}`],
        ['X-Amz-Date', amzDate],
        ['X-Amz-Expires', String(expiresInSeconds)],
        ['X-Amz-SignedHeaders', 'host'],
    ];
    const canonicalQuery = query
        .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
        .sort(([ak, av], [bk, bv]) => ak === bk ? (av < bv ? -1 : 1) : (ak < bk ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
    const canonicalRequest = [method, canonicalPath, canonicalQuery, `host:${base.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
    const signature = hex(await hmac(await signingKey(ctx, dateStamp), stringToSign));
    return `${base.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

/** Path-style object path: `/bucket/uriEncodedKey` (slashes in the key preserved). */
const objectPath = (bucket: string, key: string): string => `/${uriEncode(bucket)}/${uriEncode(key.replace(/^\/+/, ''), true)}`;

const assertOk = async (resp: Response, op: string): Promise<void> => {
    if (!resp.ok) throw new Error(`s3_${op}_failed_${resp.status}`);
};

/** Build an S3-compatible StorageProvider with zero dependencies (fetch + Web Crypto).
 *  Same contract as `s3StorageProvider`; use where the AWS SDK is unavailable or
 *  undesired (edge bundles, minimal runtimes). */
export function sigv4StorageProvider(opts: S3StorageOpts): StorageProvider {
    const ctx: SigV4Context = {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        endpoint: (opts.endpoint ?? 'https://s3.amazonaws.com').replace(/\/+$/, ''),
        region: opts.region ?? 'auto',
    };

    return {
        async put({ bucket, key, bytes, contentType }: PutOpts): Promise<{ key: string }> {
            const payloadHash = await sha256Hex(bytes);
            const { url, headers } = await sign(ctx, {
                method: 'PUT',
                canonicalPath: objectPath(bucket, key),
                payloadHash,
                ...(contentType ? { headers: { 'content-type': contentType } } : {}),
            });
            const resp = await fetch(url, { method: 'PUT', headers, body: bytes as BufferSource });
            await assertOk(resp, 'put');
            return { key };
        },

        async get(bucket: string, key: string) {
            const { url, headers } = await sign(ctx, { method: 'GET', canonicalPath: objectPath(bucket, key), payloadHash: EMPTY_SHA256 });
            const resp = await fetch(url, { method: 'GET', headers });
            await assertOk(resp, 'get');
            return { bytes: new Uint8Array(await resp.arrayBuffer()), contentType: resp.headers.get('content-type') ?? undefined };
        },

        async delete(bucket: string, key: string) {
            const { url, headers } = await sign(ctx, { method: 'DELETE', canonicalPath: objectPath(bucket, key), payloadHash: EMPTY_SHA256 });
            await assertOk(await fetch(url, { method: 'DELETE', headers }), 'delete');
        },

        async signedUrl(bucket: string, key: string, expiresInSeconds = 900): Promise<string> {
            return presign(ctx, 'GET', objectPath(bucket, key), expiresInSeconds);
        },

        async signedUploadUrl(bucket: string, key: string, _contentType?: string, expiresInSeconds = 900): Promise<string> {
            return presign(ctx, 'PUT', objectPath(bucket, key), expiresInSeconds);
        },
    };
}

/** In-memory storage provider — for tests and dev. NOT durable. */
export function memoryStorageProvider(): StorageProvider & { _store: Map<string, { bytes: Uint8Array; contentType?: string }> } {
    const store = new Map<string, { bytes: Uint8Array; contentType?: string }>();
    const k = (bucket: string, key: string) => `${bucket}/${key}`;
    return {
        _store: store,
        async put({ bucket, key, bytes, contentType }) { store.set(k(bucket, key), { bytes, contentType }); return { key }; },
        async get(bucket, key) { const v = store.get(k(bucket, key)); if (!v) throw new Error('not_found'); return { bytes: v.bytes, contentType: v.contentType }; },
        async delete(bucket, key) { store.delete(k(bucket, key)); },
        async signedUrl(bucket, key) { return `memory://${k(bucket, key)}`; },
        async signedUploadUrl(bucket, key) { return `memory://upload/${k(bucket, key)}`; },
    };
}
