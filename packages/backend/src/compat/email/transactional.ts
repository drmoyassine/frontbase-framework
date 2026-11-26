import { checkedExternalUrl, guardedExternalFetch } from '../external-http.js';
import { createResendSender } from './resend.js';
import { createAccountMail, createPasswordResetDelivery, type ResetMailOptions, type TransactionalMessage, type TransactionalSender } from './messages.js';

export interface TransactionalEmailEnv {
    FRONTBASE_EMAIL?: { send(message: TransactionalMessage & { from: string }): Promise<unknown> };
    FRONTBASE_MAIL_FROM?: string;
    FRONTBASE_MAIL_API_URL?: string;
    FRONTBASE_MAIL_API_TOKEN?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM?: string;
}

function selectSender(env: TransactionalEmailEnv, fetchImpl: typeof fetch) {
    const apiUrl = env.FRONTBASE_MAIL_API_URL?.trim();
    const token = env.FRONTBASE_MAIL_API_TOKEN?.trim();
    const from = env.FRONTBASE_MAIL_FROM?.trim();

    if (apiUrl || token) {
        if (!apiUrl || !token || /[\r\n]/.test(token) || !from) return;
        let endpoint: URL;
        try { endpoint = checkedExternalUrl(apiUrl); }
        catch { return; }
        if (endpoint.search || endpoint.hash) return;
        const send: TransactionalSender = async (message) => {
            try {
                const response = await guardedExternalFetch(fetchImpl, endpoint, {
                    method: 'POST',
                    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
                    body: JSON.stringify({ ...message, from }),
                });
                void response.body?.cancel().catch(() => {});
                if (response.ok) return;
            } catch {
                // A provider can include sensitive request details in an error.
            }
            throw Error('account_mail_delivery_failed');
        };
        return { send, accountMail: true };
    }

    const binding = env.FRONTBASE_EMAIL;
    if (binding && from) {
        const send: TransactionalSender = async (message) => {
            try { await binding.send({ ...message, from }); }
            catch { throw Error('account_mail_delivery_failed'); }
        };
        return { send, accountMail: true };
    }

    if (env.RESEND_API_KEY) {
        const resendFrom = env.RESEND_FROM?.trim();
        return {
            send: createResendSender({ apiKey: env.RESEND_API_KEY, from: resendFrom, fetchImpl }),
            accountMail: Boolean(resendFrom),
        };
    }
}

export function createTransactionalMail(
    env: TransactionalEmailEnv,
    reset: ResetMailOptions,
    fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
) {
    const sender = selectSender(env, fetchImpl);
    if (!sender) return {};
    return {
        passwordResetDelivery: createPasswordResetDelivery(sender.send, reset),
        ...(sender.accountMail ? { accountMail: createAccountMail(sender.send) } : {}),
    };
}
