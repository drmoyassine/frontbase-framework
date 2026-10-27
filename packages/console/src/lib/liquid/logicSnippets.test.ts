import { describe, it, expect } from 'vitest';
import {
    LOGIC_SNIPPETS, serializeCondition, toOperandValue, isSnippetValid, initialSnippetValues,
} from './logicSnippets';

const byKey = Object.fromEntries(LOGIC_SNIPPETS.map(s => [s.key, s]));

describe('toOperandValue', () => {
    it('quotes bare strings', () => expect(toOperandValue('gold')).toBe("'gold'"));
    it('keeps numbers', () => expect(toOperandValue('42')).toBe('42'));
    it('keeps booleans/nil', () => {
        expect(toOperandValue('true')).toBe('true');
        expect(toOperandValue('nil')).toBe('nil');
    });
    it('bares a variable', () => expect(toOperandValue('{{ x.y }}')).toBe('x.y'));
    it('leaves already-quoted as-is', () => expect(toOperandValue("'x'")).toBe("'x'"));
    it('escapes embedded quotes', () => expect(toOperandValue("o'brien")).toBe("'o\\'brien'"));
});

describe('serializeCondition', () => {
    it('builds a comparison', () => {
        expect(serializeCondition({ lhs: '{{ user.role }}', op: '==', rhs: 'admin' }))
            .toBe("user.role == 'admin'");
    });
    it('falls back to truthiness when rhs blank', () => {
        expect(serializeCondition({ lhs: 'record.active', op: '==', rhs: '' }))
            .toBe('record.active');
    });
    it('returns empty when lhs blank', () => {
        expect(serializeCondition({ lhs: '', op: '==', rhs: 'x' })).toBe('');
    });
});

describe('snippet build output', () => {
    it('if wraps a condition', () => {
        const { text } = byKey.if.build({ cond: { lhs: 'record.vip', op: '==', rhs: 'true' } });
        expect(text).toBe('{% if record.vip == true %}\n  \n{% endif %}');
    });
    it('for uses item name + bare list', () => {
        const { text } = byKey.for.build({ list: '{{ record.orders }}', item: 'order' });
        expect(text).toBe('{% for order in record.orders %}\n  \n{% endfor %}');
    });
    it('case emits one when per value', () => {
        const { text } = byKey.case.build({ subject: 'record.plan', whens: ['free', 'pro'] });
        expect(text).toContain('{% case record.plan %}');
        expect(text).toContain("{% when 'free' %}");
        expect(text).toContain("{% when 'pro' %}");
        expect(text).toContain('{% endcase %}');
    });
    it('assign quotes a bare value but bares a variable', () => {
        expect(byKey.assign.build({ name: 'x', value: 'hello' }).text).toBe("{% assign x = 'hello' %}");
        expect(byKey.assign.build({ name: 'x', value: '{{ record.t }}' }).text).toBe('{% assign x = record.t %}');
    });
    it('caretOffset lands inside the body when content is blank', () => {
        const { text, caretOffset } = byKey.if.build({ cond: { lhs: 'a', op: '==', rhs: '' } });
        // caret should be just after the opening tag + newline + indent
        expect(text.slice(0, caretOffset)).toBe('{% if a %}\n  ');
    });

    it('inlines filled then/else content (no gaps, no caret)', () => {
        const r = byKey.if_else.build({
            cond: { lhs: 'record.qty', op: '>', rhs: '0' },
            then: 'In stock',
            else: 'Sold out',
        });
        expect(r.text).toBe('{% if record.qty > 0 %}In stock{% else %}Sold out{% endif %}');
        expect(r.caretOffset).toBeUndefined();
    });

    it('inlines a single then with empty else', () => {
        const r = byKey.if_else.build({
            cond: { lhs: 'record.vip', op: '==', rhs: 'true' },
            then: 'VIP',
            else: '',
        });
        expect(r.text).toBe('{% if record.vip == true %}VIP{% else %}{% endif %}');
    });

    it('for inlines body content with item variable', () => {
        const r = byKey.for.build({ list: '{{ record.tags }}', item: 'tag', body: '{{ tag }}' });
        expect(r.text).toBe('{% for tag in record.tags %}{{ tag }}{% endfor %}');
    });

    it('falls back to scaffold + caret when content blank', () => {
        const r = byKey.if.build({ cond: { lhs: 'a', op: '==', rhs: '' }, then: '' });
        expect(r.text).toBe('{% if a %}\n  \n{% endif %}');
        expect(r.caretOffset).toBeGreaterThan(0);
    });
});

describe('multi-branch if / elsif', () => {
    it('inlines filled branches + else (no caret)', () => {
        const r = byKey.if_elsif.build({
            branches: [
                { cond: { lhs: 'record.plan', op: '==', rhs: 'gold' }, body: 'Gold' },
                { cond: { lhs: 'record.plan', op: '==', rhs: 'pro' }, body: 'Pro' },
            ],
            else: 'Standard',
        });
        expect(r.text).toBe("{% if record.plan == 'gold' %}Gold{% elsif record.plan == 'pro' %}Pro{% else %}Standard{% endif %}");
        expect(r.caretOffset).toBeUndefined();
    });

    it('scaffolds with caret into first body when all bodies blank', () => {
        const r = byKey.if_elsif.build({
            branches: [
                { cond: { lhs: 'record.plan', op: '==', rhs: 'gold' }, body: '' },
                { cond: { lhs: 'record.plan', op: '==', rhs: 'pro' }, body: '' },
            ],
            else: '',
        });
        expect(r.text).toContain('{% if record.plan == \'gold\' %}');
        expect(r.text).toContain('{% elsif record.plan == \'pro\' %}');
        expect(r.caretOffset).toBeGreaterThan(0);
    });

    it('drops branch rows with no condition lhs', () => {
        const r = byKey.if_elsif.build({
            branches: [
                { cond: { lhs: 'record.plan', op: '==', rhs: 'gold' }, body: 'Gold' },
                { cond: { lhs: '', op: '==', rhs: '' }, body: 'dropped' },
            ],
            else: '',
        });
        expect(r.text).not.toContain('dropped');
        expect(r.text).not.toContain('elsif');
    });

    it('is invalid without any branch lhs', () => {
        expect(isSnippetValid(byKey.if_elsif, { branches: [{ cond: { lhs: '', op: '==', rhs: '' }, body: '' }] })).toBe(false);
        expect(isSnippetValid(byKey.if_elsif, { branches: [{ cond: { lhs: 'a', op: '==', rhs: '' }, body: '' }] })).toBe(true);
    });
});

describe('advanced tag snippets', () => {
    it('capture inlines content / scaffolds when blank', () => {
        expect(byKey.capture.build({ name: 'g', value: 'Hi' }).text).toBe('{% capture g %}Hi{% endcapture %}');
        const blank = byKey.capture.build({ name: 'g', value: '' });
        expect(blank.text).toBe('{% capture g %}\n  \n{% endcapture %}');
        expect(blank.caretOffset).toBeGreaterThan(0);
    });

    it('cycle joins quoted values', () => {
        expect(byKey.cycle.build({ values: ['red', 'blue'] }).text).toBe("{% cycle 'red', 'blue' %}");
    });

    it('increment / decrement', () => {
        expect(byKey.increment.build({ name: 'c' }).text).toBe('{% increment c %}');
        expect(byKey.decrement.build({ name: 'c' }).text).toBe('{% decrement c %}');
    });

    it('break / continue are zero-field and always valid', () => {
        expect(byKey.break.build({}).text).toBe('{% break %}');
        expect(byKey.continue.build({}).text).toBe('{% continue %}');
        expect(isSnippetValid(byKey.break, {})).toBe(true);
        expect(isSnippetValid(byKey.continue, {})).toBe(true);
    });

    it('advanced snippets are flagged advanced; break/continue require a loop', () => {
        expect(byKey.cycle.advanced).toBe(true);
        expect(byKey.break.requiresLoop).toBe(true);
        expect(byKey.continue.requiresLoop).toBe(true);
        expect(byKey.if.advanced).toBeUndefined();
    });
});


describe('isSnippetValid', () => {
    it('requires a condition lhs', () => {
        expect(isSnippetValid(byKey.if, { cond: { lhs: '', op: '==', rhs: '' } })).toBe(false);
        expect(isSnippetValid(byKey.if, { cond: { lhs: 'a', op: '==', rhs: '' } })).toBe(true);
    });
    it('for is valid with default item name', () => {
        const vals = initialSnippetValues(byKey.for);
        vals.list = '{{ record.orders }}';
        expect(isSnippetValid(byKey.for, vals)).toBe(true);
    });
    it('case requires at least one when', () => {
        expect(isSnippetValid(byKey.case, { subject: 'record.plan', whens: [''] })).toBe(false);
        expect(isSnippetValid(byKey.case, { subject: 'record.plan', whens: ['free'] })).toBe(true);
    });
});
