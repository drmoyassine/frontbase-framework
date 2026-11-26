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
import { createAccountMail, createPasswordResetDelivery, type TransactionalSender } from './messages.js';

export { passwordResetLink, resetEmailHtml } from './messages.js';

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
export async function sendResendMessage(opts:Pick<ResendDeliveryOptions,'apiKey'|'fetchImpl'>,message:{from:string;to:string[];subject:string;html:string;text?:string;reply_to?:string}):Promise<string|null>{
    let res:Response;try{res=await(opts.fetchImpl??globalThis.fetch.bind(globalThis))(RESEND_ENDPOINT,{method:'POST',headers:{authorization:`Bearer ${opts.apiKey}`,'content-type':'application/json'},body:JSON.stringify(message)});}catch{throw Error('resend_transport_failed');}
    if(!res.ok)throw Error(`resend_delivery_failed_${res.status}`);
    const value=await res.json().catch(()=>null) as {id?:unknown}|null;return typeof value?.id==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value.id)?value.id:null;
}

export function createResendSender(opts: Pick<ResendDeliveryOptions, 'apiKey' | 'from' | 'fetchImpl'>): TransactionalSender {
    const fetchImpl: typeof fetch = (input, init) => guardedExternalFetch(opts.fetchImpl ?? globalThis.fetch.bind(globalThis), input, init);
    return async ({ to, ...message }) => {
        await sendResendMessage({ ...opts, fetchImpl }, {
            ...message,
            to: [to],
            from: opts.from || 'Frontbase <onboarding@resend.dev>',
        });
    };
}

export function createResendPasswordResetDelivery(opts: ResendDeliveryOptions) {
    return createPasswordResetDelivery(createResendSender(opts), opts);
}

export function createResendAccountMail(opts: Pick<ResendDeliveryOptions, 'apiKey' | 'from' | 'fetchImpl'>) {
    return createAccountMail(createResendSender(opts));
}
