import { sigv4StorageProvider } from '@frontbase/edge-infra';
import { checkedExternalUrl, guardedExternalFetch, type CompatFetch } from '../../../external-http.js';
import type { ProviderTestStrategy, ProviderTestResult } from './types.js';
import { s3BucketSelection } from '../../../s3-bucket-selection.js';

/** Read-only probe: a scoped bucket avoids requiring account-wide list permission. */
export class S3Strategy implements ProviderTestStrategy {
    readonly provider = 's3';
    constructor(private readonly externalFetch: CompatFetch) {}

    async test(credentials: Record<string, unknown>): Promise<ProviderTestResult> {
        const accessKeyId = String(credentials.access_key_id ?? '');
        const secretAccessKey = String(credentials.secret_access_key ?? '');
        const endpoint = String(credentials.endpoint ?? '');
        if (!accessKeyId || !secretAccessKey || !endpoint) {
            return { success: false, detail: 'S3 endpoint and access credentials are required' };
        }
        let selected: string[];
        try { selected = s3BucketSelection(credentials.bucket_selection); }
        catch { return { success: false, detail: 'Enter up to 32 valid S3 bucket names separated by commas.' }; }
        try {
            checkedExternalUrl(endpoint);
            const bucket = String(credentials.public_bucket ?? '');
            const base = String(credentials.public_base_url ?? '');
            if (bucket || base) {
                if (!bucket || !base) throw new Error('incomplete_public_url');
                const url = checkedExternalUrl(base);
                if (url.search || url.hash) throw new Error('invalid_public_url');
            }
            const client = sigv4StorageProvider({
                endpoint, accessKeyId, secretAccessKey,
                region: String(credentials.region ?? 'auto'),
                fetch: (input, init) => guardedExternalFetch(this.externalFetch, input instanceof Request ? input.url : input, init),
            });
            const testBucket = String(credentials.test_bucket ?? '');
            const buckets = [...new Set([...selected, ...(testBucket ? [testBucket] : [])])];
            if (buckets.length) await Promise.all(buckets.map(name => client.getBucket!(name)));
            else await client.listBuckets!();
            return { success: true, detail: 'S3 read access verified; uploads and public serving require separate verification' };
        } catch {
            // Provider responses/errors can contain credentials or signed request URLs.
            return { success: false, detail: 'S3 connection failed; check endpoint, region and bucket permissions' };
        }
    }
}
