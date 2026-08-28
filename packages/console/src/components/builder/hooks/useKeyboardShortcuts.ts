import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBuilderStore } from '@/stores/builder';
import { findComponent } from '@/lib/tree-utils';

interface KeyboardShortcutsOptions {
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onDeleteRequest?: () => void;
    onCardDeleteRequest?: () => void;  // For card-level deletion
}

export const useKeyboardShortcuts = (options: KeyboardShortcutsOptions = {}) => {
    const {
        selectedComponentId,
        removeComponent,
        duplicateComponent,
        copyComponent,
        pasteComponent,
        copiedComponent,
        isPreviewMode,
        // Card-level state
        selectedCardIndex,
        copiedCard,
        copyCard,
        pasteCard,
        deleteCard,
        pages,
        currentPageId,
    } = useBuilderStore(useShallow(s => ({
        selectedComponentId: s.selectedComponentId,
        removeComponent: s.removeComponent,
        duplicateComponent: s.duplicateComponent,
        copyComponent: s.copyComponent,
        pasteComponent: s.pasteComponent,
        copiedComponent: s.copiedComponent,
        isPreviewMode: s.isPreviewMode,
        selectedCardIndex: s.selectedCardIndex,
        copiedCard: s.copiedCard,
        copyCard: s.copyCard,
        pasteCard: s.pasteCard,
        deleteCard: s.deleteCard,
        pages: s.pages,
        currentPageId: s.currentPageId,
    })));

    // Get the selected card's data for copy operation
    const getSelectedCardData = () => {
        if (selectedCardIndex === null || !selectedComponentId || !currentPageId) return null;

        const page = pages.find(p => p.id === currentPageId);
        if (!page?.layoutData?.content) return null;

        const component = findComponent(page.layoutData.content, selectedComponentId);
        if (component?.type === 'FeatureSection' && component.props?.features?.[selectedCardIndex]) {
            return component.props.features[selectedCardIndex];
        }
        return null;
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger shortcuts in preview mode or when typing in inputs
            if (isPreviewMode) return;

            const target = event.target as HTMLElement;
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
                target.contentEditable === 'true';

            // Allow some shortcuts even when typing
            const isModifierKey = event.ctrlKey || event.metaKey;

            // Check if a card is selected
            const hasCardSelected = selectedCardIndex !== null && selectedComponentId;

            // Delete - Del or Backspace (only when not typing)
            if ((event.key === 'Delete' || event.key === 'Backspace') && !isTyping) {
                // If a card is selected, delete the card
                if (hasCardSelected) {
                    event.preventDefault();
                    if (options.onCardDeleteRequest) {
                        options.onCardDeleteRequest();
                    } else {
                        deleteCard();
                    }
                    return;
                }
                // Otherwise, delete the component
                if (selectedComponentId) {
                    event.preventDefault();
                    if (options.onDeleteRequest) {
                        options.onDeleteRequest();
                    } else {
                        removeComponent(selectedComponentId);
                    }
                    return;
                }
            }

            // Only handle modifier shortcuts from here
            if (!isModifierKey) return;

            // Ctrl/Cmd + S - Save
            if (event.key === 's' || event.key === 'S') {
                event.preventDefault();
                options.onSave?.();
                return;
            }

            // Ctrl/Cmd + D - Duplicate (only when not typing)
            if ((event.key === 'd' || event.key === 'D') && !isTyping && selectedComponentId) {
                event.preventDefault();
                duplicateComponent(selectedComponentId);
                return;
            }

            // Ctrl/Cmd + C - Copy (only when not typing)
            if ((event.key === 'c' || event.key === 'C') && !isTyping) {
                // If a card is selected, copy the card
                if (hasCardSelected) {
                    event.preventDefault();
                    const cardData = getSelectedCardData();
                    if (cardData) {
                        copyCard(cardData);
                    }
                    return;
                }
                // Otherwise, copy the component
                if (selectedComponentId) {
                    event.preventDefault();
                    copyComponent(selectedComponentId);
                    return;
                }
            }

            // Ctrl/Cmd + V - Paste (only when not typing)
            if ((event.key === 'v' || event.key === 'V') && !isTyping) {
                // If we have a copied card and a FeatureSection is selected, paste the card
                if (copiedCard && selectedComponentId) {
                    event.preventDefault();
                    pasteCard();
                    return;
                }
                // Otherwise, paste the component
                if (copiedComponent) {
                    event.preventDefault();
                    pasteComponent();
                    return;
                }
            }

            // Ctrl/Cmd + Z - Undo
            if (event.key === 'z' || event.key === 'Z') {
                if (event.shiftKey) {
                    // Ctrl/Cmd + Shift + Z - Redo
                    event.preventDefault();
                    options.onRedo?.();
                } else {
                    // Ctrl/Cmd + Z - Undo
                    event.preventDefault();
                    options.onUndo?.();
                }
                return;
            }

            // Ctrl/Cmd + Y - Redo (alternative)
            if (event.key === 'y' || event.key === 'Y') {
                event.preventDefault();
                options.onRedo?.();
                return;
            }

            // Ctrl/Cmd + A - Select All (prevent default browser behavior in builder)
            if ((event.key === 'a' || event.key === 'A') && !isTyping) {
                event.preventDefault();
                // Could implement select all components here if needed
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedComponentId,
        removeComponent,
        duplicateComponent,
        copyComponent,
        pasteComponent,
        copiedComponent,
        isPreviewMode,
        selectedCardIndex,
        copiedCard,
        copyCard,
        pasteCard,
        deleteCard,
        pages,
        currentPageId,
        options
    ]);
};
