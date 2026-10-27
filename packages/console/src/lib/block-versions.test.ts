import { afterEach, expect, it, vi } from 'vitest';
import { startBlockVersions } from '../../../edge-core/src/block-versions-browser';
import { contextReader } from '../../../edge-core/src/conditions';
import { cloneBlockTree, validateBlockVersions } from '../../../edge-core/src/block-versions';
import { findComponent, updateComponentInTree, insertComponentIntoTree } from './tree-utils';
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('swaps only the active DOM and tears down its data widgets when URL/local state changes', () => {
    document.body.innerHTML = `<div data-block-versions="list" data-block-active="default"><div data-block-content><p>Institutions</p></div><template data-block-version="programs" data-block-when='url.type == "program"'><div data-react-component="Repeater">Programs</div></template><template data-block-version="default"><p>Institutions</p></template></div>`;
    const context = { url: { type: 'institution' } }, beforeRemove = vi.fn(), afterInsert = vi.fn();
    const stop = startBlockVersions(contextReader(context), { beforeRemove, afterInsert });
    expect(document.querySelector('[data-react-component]')).toBeNull();
    context.url.type = 'program'; window.dispatchEvent(new Event('fb:variables-changed'));
    expect(document.querySelector('[data-block-content]')?.textContent).toBe('Programs');
    expect(beforeRemove).toHaveBeenCalledTimes(1); expect(afterInsert).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('fb:variables-changed')); expect(afterInsert).toHaveBeenCalledTimes(1);
    context.url.type = 'unknown'; window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.querySelector('[data-block-content]')?.textContent).toBe('Institutions');
    expect(beforeRemove).toHaveBeenCalledTimes(2); stop();
});

it('does not discard a dirty form if the visitor refuses a version switch', () => {
    document.body.innerHTML = `<div data-block-versions="form" data-block-active="default"><div data-block-content><form><input value="" /></form></div><template data-block-version="other" data-block-when="local.other == true">Other</template><template data-block-version="default"><form><input value="" /></form></template></div>`;
    const context = { local: { other: false } }, confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const stop = startBlockVersions(contextReader(context));
    const input = document.querySelector('input')!; input.value = 'Keep me'; input.dispatchEvent(new Event('input', { bubbles: true }));
    context.local.other = true; window.dispatchEvent(new Event('fb:variables-changed'));
    expect(confirm).toHaveBeenCalled(); expect(document.querySelector('input')?.value).toBe('Keep me'); stop();
});

it('reloads instead of swapping on localized pages, whose lists render server-only', () => {
    document.body.innerHTML = `<div data-block-versions="list" data-block-active="default"><div data-block-content><p>Institutions</p></div><template data-block-version="programs" data-block-when='url.type == "program"'><div data-react-component="Repeater">Programs</div></template><template data-block-version="default"><p>Institutions</p></template></div><div data-fb-nav-locale="ar"></div>`;
    const reload = vi.fn(); (window.location as any).reload = reload;
    const context = { url: { type: 'institution' } };
    const stop = startBlockVersions(contextReader(context));
    context.url.type = 'program'; window.dispatchEvent(new Event('fb:variables-changed'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-block-content]')?.textContent).toBe('Institutions');
    stop();
});

it('finds, edits, inserts and clones alternative children without mutating Default or sharing IDs', () => {
    const nodes: any[] = [{ id: 'list', type: 'Repeater', props: {}, children: [{ id: 'default-card', type: 'Card', props: {} }], versions: [{ id: 'programs', name: 'Programs', overrides: { children: [{ id: 'program-card', type: 'Card', props: {} }] } }] }];
    const updated = updateComponentInTree(nodes, 'program-card', node => ({ ...node, props: { title: 'Programs' } }));
    expect(findComponent(updated, 'program-card')?.props.title).toBe('Programs'); expect(nodes[0].versions[0].overrides.children[0].props).toEqual({});
    const inserted = insertComponentIntoTree(updated, 'list', { id: 'extra', type: 'Text', props: {} }, -1, { list: 'programs' });
    expect(inserted[0].children).toHaveLength(1); expect(inserted[0].versions?.[0].overrides.children).toHaveLength(2);
    let id = 0; const copied = cloneBlockTree(inserted, () => `copy-${++id}`); validateBlockVersions([...inserted, ...copied]);
    expect(findComponent(copied, 'program-card')).toBeNull();
});
