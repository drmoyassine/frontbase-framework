/** Guarded outbound HTTP seam for compatibility routes.
 *
 * Provider URLs are tenant-controlled, so every call is HTTPS-only, rejects
 * obvious loopback/private/link-local destinations, has a bounded timeout, and
 * re-validates every redirect target. By default redirects are NOT followed
 * (throw on 3xx); callers that legitimately need to follow redirects on a
 * tenant-controlled URL (WordPress sites, Apps Script Web Apps) opt in via the
 * 4th argument. When opted in, each hop is re-validated through checkedExternalUrl
 * — a public URL cannot redirect to a private/internal IP. Hosts may inject a
 * fetch implementation for deterministic conformance tests or platform-specific
 * egress controls.
 */
export type CompatFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GuardedFetchOptions {
    /** Opt into following 3xx redirects. Every hop is re-validated against the SSRF guard. */
    followRedirects?: boolean;
    /** Max redirect hops when followRedirects is on (default 5). */
    maxRedirects?: number;
}

function isForbiddenHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (
        host === 'localhost'
        || host.endsWith('.localhost')
        || host.endsWith('.local')
        || host.endsWith('.internal')
        || host === '0.0.0.0'
        || host === '::'
        || host === '::1'
        || host.startsWith('::ffff:')
        || (host.includes(':') && (
            host.startsWith('fc')
            || host.startsWith('fd')
            || host.startsWith('fe8')
            || host.startsWith('fe9')
            || host.startsWith('fea')
            || host.startsWith('feb')
        ))
    ) return true;

    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        return false;
    }
    const first = octets[0]!;
    const second = octets[1]!;
    return first === 0
        || first === 10
        || first === 127
        || (first === 100 && second >= 64 && second <= 127)
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 0)
        || (first === 192 && second === 168)
        || (first === 198 && (second === 18 || second === 19))
        || first >= 224;
}

export function checkedExternalUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('invalid_provider_url');
    }
    if (url.protocol !== 'https:' || url.username || url.password || isForbiddenHostname(url.hostname)) {
        throw new Error('unsafe_provider_url');
    }
    return url;
}

export async function guardedExternalFetch(
    fetchImpl: CompatFetch,
    input: string | URL,
    init: RequestInit = {},
    opts: GuardedFetchOptions = {},
): Promise<Response> {
    let url = checkedExternalUrl(String(input));
    const maxHops = opts.followRedirects ? Math.max(1, opts.maxRedirects ?? 5) : 0;

    for (let hop = 0; ; hop++) {
        const timeout = AbortSignal.timeout(10_000);
        const response = await fetchImpl(url, {
            ...init,
            redirect: 'manual',
            signal: init.signal ?? timeout,
        });

        // Not a redirect (or redirects not opted in) — return as-is.
        if (!(response.status >= 300 && response.status < 400) || hop >= maxHops) {
            if (!opts.followRedirects && response.status >= 300 && response.status < 400) {
                throw new Error('provider_redirect_rejected');
            }
            return response;
        }

        // Redirect + opted in: resolve the Location (may be relative) and
        // RE-VALIDATE the target through the same SSRF guard before following.
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('provider_redirect_missing_location');
        }
        let nextUrl: URL;
        try {
            nextUrl = checkedExternalUrl(new URL(location, url).toString());
        } catch {
            throw new Error('provider_redirect_unsafe');
        }
        url = nextUrl;
        // The next loop iteration re-fetches with redirect:'manual' so every hop
        // is individually validated (no opaque auto-follow).
    }
}
