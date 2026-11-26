import { escapeHtml } from './utils.js';
import { inlineMarkRuns, type InlineMark, type InlineTemplate } from '../../../inline-template.js';

/** Values are resolved before rendering. Segment boundaries are also editing targets. */
export function renderInlineLabel(props: Record<string, unknown>, format: (text: string) => string = escapeHtml): string | undefined {
    const template = props.inlineTemplate;
    if (!Array.isArray(template)) return undefined;
    const values = Array.isArray(props.inlineValues) ? props.inlineValues : [];
    const marked = (html: string, marks: InlineMark[] = []) => {
        if (!Array.isArray(marks)) return html;
        if (marks.includes('bold')) html = `<strong>${html}</strong>`;
        if (marks.includes('italic')) html = `<em>${html}</em>`;
        return html;
    };
    return (template as InlineTemplate).map((part, index) => {
        if (!part || typeof part !== 'object') return '';
        const dynamic = 'variable' in part;
        const value = String(values[index] ?? (dynamic ? '' : part.text));
        const text = dynamic ? marked(format(value), part.marks) : Array.isArray(part.emphasis) && part.emphasis.length
            ? inlineMarkRuns(value, part.emphasis).map(run => marked(format(run.text), run.marks)).join('') : format(value);
        return `<span data-fb-label-part="${index}"${dynamic ? ' data-fb-label-value' : ''}>${text}</span>`;
    }).join('');
}
