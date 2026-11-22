import { Editor, Extension, type JSONContent } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Plugin } from '@tiptap/pm/state';

interface Options {
    text: string;
    editable: boolean;
    label: string;
    onSelection: () => void;
    onText: (text: string) => void;
    onMention: () => void;
    onMark: (mark: 'bold' | 'italic') => void;
    emphasis: { phrase: string; mark: 'bold' | 'italic'; prefix?: string; suffix?: string }[];
}

function initialDocument({text,emphasis}:Options):JSONContent {
    const ranges=emphasis.flatMap(({phrase,mark,prefix='',suffix=''})=>{
        const context=prefix+phrase+suffix, first=text.indexOf(context);
        if(first<0||text.indexOf(context,first+1)>=0)return [];
        const from=first+prefix.length;
        return [{from,to:from+phrase.length,mark}];
    });
    let offset=0;
    const content=text.split('\n').map(line=>{
        const start=offset,end=start+line.length;
        offset=end+1;
        const points=[...new Set([start,end,...ranges.flatMap(({from,to})=>[from,to])])]
            .filter(point=>point>=start&&point<=end).sort((a,b)=>a-b);
        return {type:'paragraph',content:points.slice(0,-1).map((from,index)=>{
            const to=points[index+1]!;
            const marks=[...new Set(ranges.filter(range=>range.from<=from&&range.to>=to).map(range=>range.mark))];
            return {type:'text',text:text.slice(from,to),marks:marks.map(type=>({type}))};
        })};
    });
    return {type:'doc',content};
}

export function createRichEditor(element: HTMLElement, options: Options) {
    const limits = Extension.create({
        name: 'frontbaseTextDraft',
        addKeyboardShortcuts: () => ({
            'Mod-b': () => { options.onMark('bold'); return true; },
            'Mod-i': () => { options.onMark('italic'); return true; },
        }),
        addProseMirrorPlugins: () => [new Plugin({
            filterTransaction(transaction, state) {
                if (!transaction.docChanged) return true;
                const text = transaction.doc.textBetween(0, transaction.doc.content.size, '\n');
                return options.editable ? text.length <= 12000 && !/\{[{%]/.test(text)
                    : text === state.doc.textBetween(0, state.doc.content.size, '\n');
            },
        })],
    });
    let lastText = options.text;
    const editor = new Editor({
        element, injectCSS: false,
        extensions: [Document, Paragraph, Text, Bold, Italic, limits],
        content: initialDocument(options),
        editorProps: {
            attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': options.label,
                style: 'min-height:3.5rem;max-height:11rem;overflow:auto;white-space:pre-wrap;padding:6px;border:1px solid #94a3b8;border-radius:6px' },
            handleKeyDown(_view, event) {
                if (event.key !== '@' || event.isComposing) return false;
                options.onMention();
                return true;
            },
        },
        onSelectionUpdate: options.onSelection,
        onUpdate({ editor }) {
            const text = editor.getText({ blockSeparator: '\n' });
            if (text === lastText) return;
            lastText = text;
            options.onText(text);
        },
    });
    return {
        destroy: () => editor.destroy(),
        selection() {
            const { doc, selection } = editor.state;
            return { text: editor.getText({ blockSeparator: '\n' }),
                raw: doc.textBetween(selection.from, selection.to, '\n'),
                from: doc.textBetween(0, selection.from, '\n').length };
        },
        mark(mark: 'bold' | 'italic', enabled: boolean) {
            if (enabled) editor.commands.setMark(mark); else editor.commands.unsetMark(mark);
        },
    };
}
