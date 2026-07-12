/**
 * ComponentRenderer (Phase 3c / F1) — renders a canvas node to LIVE React output,
 * giving the builder a true WYSIWYG preview (you see the actual heading/text/image,
 * not just a "Heading" label in a layers list).
 *
 * Maps the 17 component types from lib/components.ts to React elements. This is the
 * browser-side render path — it does NOT call the engine; it's a lightweight visual
 * mirror of what the engine would render on the edge (the published preview iframe
 * remains the source of truth for exact parity).
 */
import type { ComponentType } from 'react';

export interface CanvasNodeLite {
    id: string;
    type: string;
    props: Record<string, unknown>;
    children?: CanvasNodeLite[];
}

const sizeClass: Record<string, string> = {
    xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg',
    xl: 'text-xl', '2xl': 'text-2xl', '3xl': 'text-3xl',
};
const weightClass: Record<string, string> = {
    light: 'font-light', normal: 'font-normal', medium: 'font-medium',
    semibold: 'font-semibold', bold: 'font-bold',
};
const alignClass: Record<string, string> = {
    left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify',
};
const spacerClass: Record<string, string> = {
    xs: 'h-2', sm: 'h-4', medium: 'h-8', lg: 'h-12', xl: 'h-20',
};
const padClass: Record<string, string> = {
    none: 'p-0', small: 'p-2', medium: 'p-4', large: 'p-8',
};
const gapClass: Record<string, string> = {
    none: 'gap-0', small: 'gap-2', medium: 'gap-4', large: 'gap-8',
};

/** Render a single node to live React. Unknown types render a placeholder box. */
export const ComponentRenderer: ComponentType<{ node: CanvasNodeLite; selected?: boolean; onSelect?: (id: string) => void }> = ({ node, selected, onSelect }) => {
    const p = node.props;
    const common = {
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect?.(node.id); },
        className: `relative cursor-pointer rounded transition-all hover:outline hover:outline-1 hover:outline-primary ${selected ? 'outline outline-2 outline-primary' : ''}`,
        'data-node-id': node.id,
    };

    switch (node.type) {
        case 'Heading': {
            const Tag = (p.level as string || 'h2') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            return <Tag {...common} className={`${common.className} ${alignClass[p.align as string] ?? ''} font-bold`}>{String(p.content ?? '')}</Tag>;
        }
        case 'Text':
        case 'Paragraph':
            return <p {...common} className={`${common.className} ${sizeClass[p.size as string] ?? 'text-base'} ${weightClass[p.weight as string] ?? ''} ${alignClass[p.align as string] ?? ''}`}>{String(p.content ?? '')}</p>;
        case 'Link':
            return <a {...common} href={String(p.href ?? '#')} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect?.(node.id); }} className={`${common.className} text-primary underline`}>{String(p.content ?? '')}</a>;
        case 'Badge': {
            const variant = p.variant as string;
            const variantClass = variant === 'secondary' ? 'bg-secondary text-secondary-foreground' : variant === 'destructive' ? 'bg-destructive text-destructive-foreground' : variant === 'outline' ? 'border' : 'bg-primary text-primary-foreground';
            return <span {...common} className={`${common.className} inline-block rounded-full px-2 py-0.5 text-xs ${variantClass}`}>{String(p.content ?? '')}</span>;
        }
        case 'Image':
            return <img {...common} src={String(p.src ?? '')} alt={String(p.alt ?? '')} className={`${common.className} max-w-full rounded`} style={{ width: p.width ? `${p.width}px` : 'auto', height: p.height ? `${p.height}px` : 'auto', objectFit: (p.fit as React.CSSProperties['objectFit']) ?? 'cover' }} />;
        case 'Video':
            return <video {...common} src={String(p.src ?? '')} poster={String(p.poster ?? '')} controls={!!p.controls} loop={!!p.loop} className={`${common.className} max-w-full rounded`} />;
        case 'Button': {
            const variant = p.variant as string;
            const variantClass = variant === 'destructive' ? 'bg-destructive text-destructive-foreground' : variant === 'outline' ? 'border' : variant === 'secondary' ? 'bg-secondary' : variant === 'ghost' ? 'hover:bg-accent' : variant === 'link' ? 'text-primary underline' : 'bg-primary text-primary-foreground';
            const sizeClass2 = p.size === 'sm' ? 'px-3 py-1.5 text-sm' : p.size === 'lg' ? 'px-8 py-3' : p.size === 'icon' ? 'p-2' : 'px-4 py-2';
            return <button {...common} className={`${common.className} rounded-md font-medium ${variantClass} ${sizeClass2}`}>{String(p.content ?? '')}</button>;
        }
        case 'Input':
            return <div {...common} className={common.className}><span className="text-xs text-muted-foreground">{String(p.label ?? '')}</span><input disabled placeholder={String(p.placeholder ?? '')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>;
        case 'Textarea':
            return <div {...common} className={common.className}><span className="text-xs text-muted-foreground">{String(p.label ?? '')}</span><textarea disabled placeholder={String(p.placeholder ?? '')} rows={Number(p.rows ?? 3)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>;
        case 'Checkbox':
            return <label {...common} className={`${common.className} flex items-center gap-2 text-sm`}><input type="checkbox" disabled checked={!!p.checked} /> {String(p.label ?? '')}</label>;
        case 'Code':
            return <pre {...common} className={`${common.className} overflow-x-auto rounded bg-muted p-3 font-mono text-xs`}><code>{String(p.content ?? '')}</code></pre>;
        case 'Divider':
            return <hr {...common} className={common.className} />;
        case 'Spacer':
            return <div {...common} className={`${common.className} ${spacerClass[p.size as string] ?? 'h-8'}`} />;
        case 'Container':
            return <div {...common} className={`${common.className} ${padClass[p.padding as string] ?? ''} ${gapClass[p.gap as string] ?? ''} ${alignClass[p.align as string] ?? ''} border border-dashed border-muted-foreground/30`}>{(node.children ?? []).map((c) => <ComponentRenderer key={c.id} node={c} onSelect={onSelect} />)}</div>;
        case 'Columns': {
            const n = Number(p.columns ?? 2);
            return <div {...common} className={`${common.className} grid ${gapClass[p.gap as string] ?? 'gap-4'}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>{Array.from({ length: n }).map((_, i) => <div key={i} className="min-h-12 rounded border border-dashed border-muted-foreground/30" />)}</div>;
        }
        default:
            return <div {...common} className={`${common.className} border border-dashed border-destructive/50 p-3 text-xs text-destructive`}>Unknown: {node.type}</div>;
    }
};

/** Render a full layout (content array) to live React. */
export function renderLayout(layout: { content: CanvasNodeLite[] }, selectedId?: string | null, onSelect?: (id: string) => void) {
    return (layout.content ?? []).map((node) => (
        <ComponentRenderer key={node.id} node={node} selected={selectedId === node.id} onSelect={onSelect} />
    ));
}
