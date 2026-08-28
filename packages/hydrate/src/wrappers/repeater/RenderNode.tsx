import React from 'react';
import { renderSync, isSimpleInterpolation } from '@frontbase/liquid-core';
import { useRecord } from './RecordContext';

interface Node {
    id?: string;
    type: string;
    props?: Record<string, any>;
    children?: Node[];
}

/**
 * Resolve a string prop against the current Repeater record when it's a simple
 * `{{ record.* }}` interpolation. Non-strings and complex (`{% %}`) templates
 * pass through unchanged.
 */
function resolve(value: any, record: Record<string, any> | null): any {
    if (record && typeof value === 'string' && value.includes('{{') && value.includes('record') && isSimpleInterpolation(value)) {
        return renderSync(value, { record });
    }
    return value;
}

function cls(...parts: (string | false | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

/**
 * Minimal recursive renderer for the Repeater's template primitives on the
 * published page. Supports the common building blocks (Text, Heading, Image,
 * Card, Container, Row, Column, Badge, Button, Link, Icon, Separator). Unknown
 * types render their children so nesting still works. String props resolve
 * `{{ record.* }}` via the shared Liquid core.
 */
export function RenderNode({ node }: { node: Node }): React.ReactElement | null {
    const record = useRecord(); // one hook, unconditional
    if (!node) return null;
    const { type, props = {}, children = [] } = node;

    const kids = children.map((c, i) => <RenderNode key={c.id || i} node={c} />);

    switch (type) {
        case 'Text': {
            const text = resolve(props.text, record) ?? '';
            const size = props.size === 'sm' ? 'text-sm' : props.size === 'lg' ? 'text-lg' : 'text-base';
            return <p className={cls(size, props.className)}>{text}</p>;
        }
        case 'Heading': {
            const text = resolve(props.text, record) ?? '';
            const level = String(props.level || '2').replace(/^h/i, '');
            const sizes: Record<string, string> = {
                '1': 'text-4xl font-bold', '2': 'text-3xl font-semibold', '3': 'text-2xl font-semibold',
                '4': 'text-xl font-semibold', '5': 'text-lg font-semibold', '6': 'text-base font-semibold',
            };
            const Tag = `h${level}` as keyof JSX.IntrinsicElements;
            return <Tag className={cls(sizes[level] || sizes['2'], props.className)}>{text}</Tag>;
        }
        case 'Image': {
            const src = resolve(props.src, record) ?? '';
            return <img src={src} alt={props.alt || ''} className={props.className} style={props.style} />;
        }
        case 'Badge': {
            const text = resolve(props.text, record) ?? '';
            return (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                    {text}
                </span>
            );
        }
        case 'Button': {
            const text = resolve(props.text, record) ?? '';
            return (
                <button className={cls('inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium', props.className)}>
                    {text}
                </button>
            );
        }
        case 'Link': {
            const text = resolve(props.text, record) ?? '';
            const href = resolve(props.href, record) ?? '#';
            return <a href={href} className={props.className}>{text}</a>;
        }
        case 'Icon':
            return <span className={props.className}>{props.icon}</span>;
        case 'Separator':
            return <hr className={props.className} />;
        case 'Card':
            return <div className={cls('rounded-lg border bg-card text-card-foreground shadow-sm p-6', props.className)}>{kids}</div>;
        case 'Container':
            return <div className={props.className} style={props.style}>{kids}</div>;
        case 'Row':
            return <div className={cls('flex flex-row', props.className)} style={props.style}>{kids}</div>;
        case 'Column':
            return <div className={cls('flex flex-col', props.className)} style={props.style}>{kids}</div>;
        default:
            // Unknown type — render children so the structure isn't lost.
            return <>{kids}</>;
    }
}
