/**
 * Fake lead store — fixture prototype. In-memory only; nothing persists.
 *
 * The single durability rule the prototype proves: ONE record per dedupe key,
 * no matter how many times the same submission is retried. `insertLead` is
 * compare-and-insert: a repeated key returns the ORIGINAL lead and inserts
 * nothing, so retry storms, double clicks and lost-response resubmits cannot
 * multiply records.
 *
 * Production storage is a primary-reviewed decision (owner-scoped settings/
 * store seam); this fake only fixes the contract the real store must keep.
 */

import { randomUUID } from 'node:crypto';

export function createFakeLeadStore() {
    const byKey = new Map();   // dedupeKey -> lead
    const byId = new Map();    // leadId -> lead

    return {
        /** Compare-and-insert. Returns { status, lead }; never duplicates. */
        insertLead(record) {
            const existing = byKey.get(record.dedupeKey);
            if (existing) return { status: 'duplicate', lead: existing };
            const lead = {
                leadId: randomUUID(),
                receiptId: randomUUID().replace(/-/g, '').slice(0, 24),
                dedupeKey: record.dedupeKey,
                formId: record.formId,
                context: record.context,
                values: record.values,
                receivedAt: record.receivedAt,
                delivery: { state: 'pending', attempts: 0, lastError: null, deliveredAt: null },
            };
            byKey.set(record.dedupeKey, lead);
            byId.set(lead.leadId, lead);
            return { status: 'stored', lead };
        },

        getByLeadId(leadId) {
            return byId.get(leadId) ?? null;
        },

        getByReceipt(receiptId) {
            for (const lead of byId.values()) {
                if (lead.receiptId === receiptId) return lead;
            }
            return null;
        },

        /** Delivery state transitions are explicit and one-way per attempt. */
        markDelivery(leadId, patch) {
            const lead = byId.get(leadId);
            if (!lead) return null;
            lead.delivery = { ...lead.delivery, ...patch };
            return lead;
        },

        /** Leads awaiting a delivery retry (the sweep's input). */
        listPending() {
            return [...byId.values()].filter(l => l.delivery.state === 'pending');
        },

        counts() {
            return { leads: byId.size, dedupeKeys: byKey.size };
        },

        reset() {
            byKey.clear();
            byId.clear();
        },
    };
}
