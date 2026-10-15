import { evaluateCondition, contextReader, type VariableReader } from './conditions.js';

/** Native DOM swaps. Inert templates never mount actions, forms or data widgets. */
export function startBlockVersions(read: VariableReader, lifecycle: { beforeRemove?: (root: Element) => void; afterInsert?: (root: Element) => void } = {}): () => void {
    const dirty = new WeakSet<Element>();
    const refused = new WeakMap<Element,string>();
    const markDirty = (event: Event) => { if (event.target instanceof Element&&event.target.closest('form,[data-fb-hydrate="form"],[data-react-component="Form"]')) dirty.add(event.target); };
    document.addEventListener('input', markDirty);
    document.addEventListener('change', markDirty);
    let updating = false;
    const update = () => {
        if (updating) return;
        updating = true;
        try {
            // Query afresh so newly inserted nested versions are handled on this update.
            for (let pass = 0; pass < 32; pass++) {
                let changed = false;
                for (const host of document.querySelectorAll<HTMLElement>('[data-block-versions]')) {
                    if(!host.isConnected)continue;
                    const content = Array.from(host.children).find(child => child.hasAttribute('data-block-content'));
                    if (!content) continue;
                    const templates = Array.from(host.children).filter(child => child instanceof HTMLTemplateElement) as HTMLTemplateElement[];
                    let record:unknown;try{record=JSON.parse(host.dataset.blockRecord??'null');}catch{}
                    const scopedRead:VariableReader=(scope,key)=>scope==='record'?contextReader({record})(scope,key):read(scope,key);
                    const selected = templates.find(template => {
                        const when = template.getAttribute('data-block-when');
                        return when && evaluateCondition(when, scopedRead);
                    }) ?? templates.find(template => template.dataset.blockVersion === 'default');
                    if (!selected || selected.dataset.blockVersion === host.dataset.blockActive) {refused.delete(host);continue;}
                    if(refused.get(host)===selected.dataset.blockVersion)continue;
                    if (Array.from(content.querySelectorAll('input,textarea,select')).some(field => dirty.has(field)) && !window.confirm('Switching this version will discard unsaved form entries. Continue?')) {refused.set(host,selected.dataset.blockVersion!);continue;}
                    refused.delete(host);
                    lifecycle.beforeRemove?.(content);
                    content.replaceChildren(selected.content.cloneNode(true));
                    host.dataset.blockActive = selected.dataset.blockVersion;
                    lifecycle.afterInsert?.(content);
                    changed = true;
                }
                if (!changed) break;
            }
        } finally { updating = false; }
    };
    update();
    window.addEventListener('fb:variables-changed', update);
    window.addEventListener('popstate', update);
    window.addEventListener('frontbase:blocks-inserted', update);
    return () => { document.removeEventListener('input', markDirty); document.removeEventListener('change', markDirty); window.removeEventListener('fb:variables-changed', update); window.removeEventListener('popstate', update); window.removeEventListener('frontbase:blocks-inserted',update); };
}
