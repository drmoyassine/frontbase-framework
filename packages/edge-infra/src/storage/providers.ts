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
