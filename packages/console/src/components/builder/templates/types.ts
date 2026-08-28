/**
 * Template Types and Utilities
 */

export interface ComponentTemplate {
    type: string;
    props: Record<string, any>;
    styles?: Record<string, any>;
    children?: ComponentTemplate[];
}

// Helper to generate unique IDs
export const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
