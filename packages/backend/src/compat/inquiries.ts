import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import type { PublicFormDraft } from '@frontbase/edge-core';
import type { SecretCipher } from '../db/secret-cipher.js';
import { publicationHash } from './publication-hash.js';

/** May also be called by a Node/Docker operator's daily state-database maintenance job. */
export async function purgeExpiredInquiries(db:DbRunner, at=new Date().toISOString()):Promise<void> {
    await db.exec('DELETE FROM public_inquiries WHERE expires_at <= ?', [at]);
}

const contextSchema = z.object({
    owner: z.string(), path: z.string().max(2048).regex(/^\/(?!\/)/), search:z.string().max(4096), pageId: z.string(), revision: z.string(),
    locale: z.string(), formId: z.string(), collection: z.string().nullable(), recordId: z.string().nullable(), parentId: z.string().nullable(),
}).strict();
export type InquiryContext = z.infer<typeof contextSchema>;
export type PublishedInquiryIssuer = (context: InquiryContext, form: PublicFormDraft) => Promise<string | undefined>;
const ticketSchema = z.object({
    kind: z.literal('frontbase.inquiry.v1'), id: z.string().uuid(), expires: z.number().int(),
    context: contextSchema, formHash: z.string().length(64),
}).strict();
export function inquiryTickets(cipher: SecretCipher, now = Date.now): PublishedInquiryIssuer {
    return async (context, form) => {
        const sealed = await cipher.encrypt(JSON.stringify({
            kind: 'frontbase.inquiry.v1', id: crypto.randomUUID(), expires: now() + 60 * 60_000,
            context, formHash: await publicationHash(form),
        }));
        return cipher.isEncrypted(sealed) ? sealed : undefined;
    };
}
export async function openInquiryTicket(cipher: SecretCipher, value: string, owner: string, time: number) {
    if (value.length > 8192 || !cipher.isEncrypted(value)) return null;
    try {
        const ticket = ticketSchema.parse(JSON.parse(await cipher.decrypt(value)));
        return ticket.context.owner === owner && ticket.expires > time ? ticket : null;
    } catch { return null; }
}
