/**
 * A-25 Phase 4 — password-reset delivery via Resend (product parity: the cloud
 * deployment's transactional email provider).
 *
 * The compat surface already treats delivery as a swappable capability
 * (auth-compat.ts `deliverPasswordReset`): failures are swallowed and the
 * forgot-password response stays non-enumerating. This module only shapes the
 * email — the reset LINK points at the cloud console's reset page
 * (`/admin/reset-password?token=…&email=…`, the BASE_PATH the console SPA is
 * staged under in cloud mode) and the token never persists anywhere.
 *
 * Credentials travel as constructor input from the host (worker env), never
 * process.env; the fetch seam is injectable for tests.
 */

import { guardedExternalFetch } from '../external-http.js';

export interface ResendDeliveryOptions {
    /** Host-owned console location; never derived from request Host/forwarded headers. */
    adminPath?: '/admin/reset-password' | '/frontbase-admin/reset-password';
    /** Resend API key (re_…). Host-injected; never logged. */
    apiKey: string;
    /** Verified Resend sender. Defaults to Resend's onboarding sender so a
     *  misconfigured domain degrades to deliverable-from-resend.dev, not dead. */
    from?: string;
    /** The app origin the reset link points at (e.g. https://app.frontbase.dev). */
    baseUrl: string;
    /** Injectable fetch (tests). Production: globalThis.fetch. */
    fetchImpl?: typeof fetch;
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Shared fixed-endpoint HTTP transport; acceptance is not a delivery receipt. */
export async function sendResendMessage(opts:Pick<ResendDeliveryOptions,'apiKey'|'fetchImpl'>,message:{from:string;to:string[];subject:string;html:string;reply_to?:string}):Promise<string|null>{
    let res:Response;try{res=await(opts.fetchImpl??globalThis.fetch.bind(globalThis))(RESEND_ENDPOINT,{method:'POST',headers:{authorization:`Bearer ${opts.apiKey}`,'content-type':'application/json'},body:JSON.stringify(message)});}catch{throw Error('resend_transport_failed');}
    if(!res.ok)throw Error(`resend_delivery_failed_${res.status}`);
    const value=await res.json().catch(()=>null) as {id?:unknown}|null;return typeof value?.id==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value.id)?value.id:null;
}

export function passwordResetLink(baseUrl: string, email: string, token: string, adminPath:ResendDeliveryOptions['adminPath']='/admin/reset-password'): string {
    const url=new URL(baseUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('reset_origin_invalid');
    if(adminPath!=='/admin/reset-password'&&adminPath!=='/frontbase-admin/reset-password')throw Error('reset_path_invalid');
    return `${url.origin}${adminPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export function resetEmailHtml(baseUrl: string, email: string, token: string,adminPath?:ResendDeliveryOptions['adminPath']): string {
    const link = passwordResetLink(baseUrl, email, token,adminPath);
    return [
        '<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d10;color:#e7ebf0;padding:2rem">',
        '<div style="max-width:32rem;margin:0 auto">',
        '<h1 style="font-size:1.25rem;margin:0 0 1rem">Reset your password</h1>',
        `<p style="color:#9aa4b2;line-height:1.5;margin:0 0 1.5rem">A password reset was requested for <strong>${escapeHtml(email)}</strong>. This link is single-use and expires soon.</p>`,
        `<p style="margin:0 0 1.5rem"><a href="${link}" style="color:#7fb4ff">Choose a new password →</a></p>`,
        `<p style="color:#6b7684;font-size:.85rem;margin:0">If you didn't request this, you can ignore this email.</p>`,
        '</div></body></html>',
    ].join('');
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

/** The `deliverPasswordReset` capability backed by Resend. Throws on transport
 *  failure — the route's swallow keeps the response non-enumerating. */
export function createResendPasswordResetDelivery(
    opts: ResendDeliveryOptions,
): (email: string, token: string) => Promise<void> {
    passwordResetLink(opts.baseUrl,'validation@example.com','validation',opts.adminPath);
    return async (email, token) => {
        await sendResendMessage({...opts,fetchImpl:(input,init)=>guardedExternalFetch(opts.fetchImpl??globalThis.fetch.bind(globalThis),input,init)},{
                from: opts.from ?? 'Frontbase <onboarding@resend.dev>',
                to: [email],
                subject: 'Reset your password',
                html: resetEmailHtml(opts.baseUrl, email, token,opts.adminPath),
            });
    };
}
