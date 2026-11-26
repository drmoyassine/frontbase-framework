import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import type { InlinePickerRequest } from '@frontbase/edge-core';
import { VariablePickerView } from './VariablePickerView';

const editorQueries = new QueryClient();

export function mountInlineVariablePicker(request: InlinePickerRequest, options: {
    pageId?: string;
    recordColumns: string[];
    acceptVariable: (path: string) => boolean;
    stylesheet?: string;
    queryClient?: QueryClient;
}) {
    const {host, arabic, outsideBoundary, onSelect, onClose} = request;
    const doc = host.ownerDocument;
    const panel = doc.createElement('div');
    panel.dir = arabic ? 'rtl' : 'ltr';
    host.append(panel);
    const target = options.stylesheet ? panel.attachShadow({ mode: 'open' }) : panel;
    if (options.stylesheet) {
        const style = doc.createElement('link');
        style.rel = 'stylesheet';
        style.href = options.stylesheet;
        target.append(style);
        panel.style.cssText = 'color-scheme:light;--popover:0 0% 100%;--foreground:222 47% 11%;--muted-foreground:215 19% 35%;--muted:210 40% 96%;--accent:210 40% 93%;--border:214 32% 85%';
    }
    const mount = doc.createElement('div');
    target.append(mount);
    const root = createRoot(mount);
    root.render(<QueryClientProvider client={options.queryClient ?? editorQueries}>
        <VariablePickerView pageId={options.pageId} position={{top:0,left:0}} searchTerm="" portalTarget={target} embedded arabic={arabic}
            recordColumns={options.recordColumns} acceptVariable={options.acceptVariable} outsideBoundary={outsideBoundary} onClose={onClose}
            onSelect={expression => {
                const path = /^\{\{\s*(\S+)\s*\}\}$/.exec(expression)?.[1];
                if (path && options.acceptVariable(path)) onSelect(path);
            }} />
    </QueryClientProvider>);
    return () => {
        panel.remove();
        queueMicrotask(() => root.unmount());
    };
}
