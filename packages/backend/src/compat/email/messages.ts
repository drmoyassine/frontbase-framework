export interface TransactionalMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
}

export type TransactionalSender = (message: TransactionalMessage) => Promise<void>;

export interface ResetMailOptions {
    baseUrl: string;
    adminPath?: '/admin/reset-password' | '/frontbase-admin/reset-password';
}

export function passwordResetLink(baseUrl: string, email: string, token: string, adminPath:ResetMailOptions['adminPath']='/admin/reset-password'): string {
    const url=new URL(baseUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('reset_origin_invalid');
    if(adminPath!=='/admin/reset-password'&&adminPath!=='/frontbase-admin/reset-password')throw Error('reset_path_invalid');
    return `${url.origin}${adminPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export function resetEmailHtml(baseUrl: string, email: string, token: string,adminPath?:ResetMailOptions['adminPath']): string {
    const link = passwordResetLink(baseUrl, email, token,adminPath);
    return [
        '<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d10;color:#e7ebf0;padding:2rem">',
        '<div style="max-width:32rem;margin:0 auto">',
        '<h1 style="font-size:1.25rem;margin:0 0 1rem">Reset your password</h1>',
        `<p style="color:#9aa4b2;line-height:1.5;margin:0 0 1.5rem">A password reset was requested for <strong>${escapeHtml(email)}</strong>. This link is single-use and expires soon.</p>`,
        `<p style="margin:0 0 1.5rem"><a href="${escapeHtml(link)}" style="color:#7fb4ff">Choose a new password →</a></p>`,
        `<p style="color:#6b7684;font-size:.85rem;margin:0">If you didn't request this, you can ignore this email.</p>`,
        '</div></body></html>',
    ].join('');
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

export function createPasswordResetDelivery(send: TransactionalSender, opts: ResetMailOptions) {
    passwordResetLink(opts.baseUrl, 'validation@example.com', 'validation', opts.adminPath);
    return (email: string, token: string) => send({
        to: email,
        subject: 'Reset your password',
        html: resetEmailHtml(opts.baseUrl, email, token, opts.adminPath),
        text: 'Choose a new password using this single-use link: ' + passwordResetLink(opts.baseUrl, email, token, opts.adminPath),
    });
}

export function createAccountMail(send: TransactionalSender) {
    return {
        verifyAddress(email: string, code: string) {
            const instructions = 'Enter this code in My account within 15 minutes.';
            const ignore = 'If you did not request this change, ignore this message.';
            return send({
                to: email,
                subject: 'Verify your new Frontbase email address',
                html: '<p>' + instructions + '</p><p><strong>' + escapeHtml(code) + '</strong></p><p>' + ignore + '</p>',
                text: instructions + '\n\n' + code + '\n\n' + ignore,
            });
        },
        verifyRecoveryAddress(email: string, code: string) {
            const instructions = 'Enter this code in Frontbase within 15 minutes to verify your recovery email.';
            return send({to:email,subject:'Verify your Frontbase recovery email',
                text:instructions + '\n\n' + code,html:'<p>' + instructions + '</p><p><strong>' + escapeHtml(code) + '</strong></p>'});
        },
        notifyOldAddress(email: string) {
            const text = 'Your Frontbase sign-in address was changed. If you did not authorize this change, contact your site administrator.';
            return send({ to: email, subject: 'Your Frontbase sign-in email changed', html: '<p>' + text + '</p>', text });
        },
    };
}
