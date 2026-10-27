import { StateCreator } from 'zustand';
import { BuilderState } from '../builder';

export interface UISlice {
    // Builder state
    isPreviewMode: boolean;
    isSaving: boolean;
    hasUnsavedChanges: boolean;

    // Responsive state
    currentViewport: 'mobile' | 'tablet' | 'desktop';
    zoomLevel: number;
    showDeviceFrame: boolean;
    showGrid: boolean;
    snapToGrid: boolean;

    // Scroll target selection mode
    scrollTargetSelectionMode: boolean;
    scrollTargetCallback: ((componentId: string, componentType: string) => void) | null;

    // Supabase connection
    isSupabaseConnected: boolean;
    supabaseTables: any[];
    isInitialized: boolean;

    // Actions
    setPreviewMode: (isPreview: boolean) => void;
    setSaving: (saving: boolean) => void;
    setUnsavedChanges: (hasChanges: boolean) => void;
    setCurrentViewport: (viewport: 'mobile' | 'tablet' | 'desktop') => void;
    setZoomLevel: (zoom: number) => void;
    setShowDeviceFrame: (show: boolean) => void;
    setShowGrid: (show: boolean) => void;
    setSnapToGrid: (snap: boolean) => void;
    setSupabaseConnection: (connected: boolean, tables?: any[]) => void;

    // Scroll target selection actions
    enterScrollTargetMode: (callback: (componentId: string, componentType: string) => void) => void;
    exitScrollTargetMode: () => void;
}

export const createUISlice: StateCreator<BuilderState, [], [], UISlice> = (set) => ({
    isPreviewMode: false,
    isSaving: false,
    hasUnsavedChanges: false,

    currentViewport: 'desktop',
    zoomLevel: 100,
    showDeviceFrame: true,
    showGrid: false,
    snapToGrid: false,

    // Scroll target selection mode
    scrollTargetSelectionMode: false,
    scrollTargetCallback: null,

    isSupabaseConnected: false,
    supabaseTables: [],
    isInitialized: false,

    setPreviewMode: (isPreview) => set({ isPreviewMode: isPreview }),
    setSaving: (saving) => set({ isSaving: saving }),
    setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
    setCurrentViewport: (viewport) => set({ currentViewport: viewport }),
    setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
    setShowDeviceFrame: (show) => set({ showDeviceFrame: show }),
    setShowGrid: (show) => set({ showGrid: show }),
    setSnapToGrid: (snap) => set({ snapToGrid: snap }),
    setSupabaseConnection: (connected, tables) => set({ isSupabaseConnected: connected, supabaseTables: tables || [] }),

    // Scroll target selection actions
    enterScrollTargetMode: (callback) => set({
        scrollTargetSelectionMode: true,
        scrollTargetCallback: callback
    }),
    exitScrollTargetMode: () => set({
        scrollTargetSelectionMode: false,
        scrollTargetCallback: null
    }),
});
