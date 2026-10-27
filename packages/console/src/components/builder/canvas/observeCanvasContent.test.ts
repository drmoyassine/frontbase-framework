import { afterEach, expect, it, vi } from 'vitest';
import { observeCanvasContent } from './observeCanvasContent';
import { queryComponentRects, stampComponentIds } from '@/lib/builder/iframeBridge';

afterEach(() => { document.body.innerHTML = ''; });

it('refreshes for delayed image loads and detaches the resource listener', () => {
    document.body.innerHTML = '<img alt="Record image">';
    const refresh = vi.fn();
    const stop = observeCanvasContent(document, refresh);
    document.querySelector('img')!.dispatchEvent(new Event('load'));
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    document.querySelector('img')!.dispatchEvent(new Event('load'));
    expect(refresh).toHaveBeenCalledTimes(1);
});

it('discovers asynchronously inserted record targets without needing a body resize', async () => {
    document.body.innerHTML = '<div id="list" style="height:600px"></div>';
    const nodes: any = [{id:'list', type:'Repeater', props:{}, children:[{id:'card',type:'Card',props:{}}]}];
    const refresh = vi.fn(() => stampComponentIds(document, nodes));
    const stop = observeCanvasContent(document, refresh);
    document.getElementById('list')!.innerHTML = '<div id="card" data-fb-template-source="card">Loaded record</div>';
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(queryComponentRects(document).find(rect => rect.id === 'card')).toMatchObject({type:'Card',parentId:'list'});
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1); // identity attribute stamps do not loop
    stop();
    document.getElementById('list')!.textContent = 'After teardown';
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
});
