import { DndContext } from '@dnd-kit/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useBuilderStore, type Page } from '@/stores/builder';
import { CanvasOverlay } from './CanvasOverlay';

afterEach(() => {
    cleanup();
    useBuilderStore.getState().reset();
});

it.each([
    ['desktop', 'en'], ['desktop', 'ar'], ['mobile', 'en'], ['mobile', 'ar'],
] as const)('resizes and reorders the selected tile in the %s %s draft without altering bindings', (viewport, locale) => {
    const binding = { viewId: 'institutions', field: 'description' };
    const page: Page = {
        id: 'page', name: 'Institution detail', slug: 'institution', isPublic: true, isHomepage: false,
        createdAt: '', updatedAt: '',
        layoutData: { root: {}, content: [
            { id: 'about', type: 'Container', props: { _layerName: locale === 'ar' ? 'نبذة' : 'About' }, binding },
            { id: 'address', type: 'Container', props: {} },
        ] },
    };
    useBuilderStore.setState({ pages: [page], currentPageId: page.id, selectedComponentId: 'about', currentViewport: viewport });
    const rects = page.layoutData!.content.map((node, index) => ({
        id: node.id, type: node.type, left: 0, top: index * 120, width: 280, height: 100, depth: 0,
    }));
    render(<section lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <DndContext><CanvasOverlay page={page} rects={rects} hoveredId={null} /></DndContext>
    </section>);

    fireEvent.click(screen.getByRole('button', { name: 'Narrow tile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move tile later' }));
    const state = useBuilderStore.getState();
    const content = state.pages[0].layoutData!.content;
    expect(state.hasUnsavedChanges).toBe(true);
    expect(content.map(node => node.id)).toEqual(['address', 'about']);
    expect(content[1].binding).toEqual(binding);
    expect(viewport === 'mobile' ? content[1].stylesData?.viewportOverrides?.mobile?.width : content[1].stylesData?.values.width).toBe('90%');
    expect(state.layoutUndo).toHaveLength(2);
});
