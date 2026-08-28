import type { CSSPropertyConfig } from './types';

// Comprehensive CSS property configurations
export const CSS_PROPERTY_CONFIGS: Record<string, CSSPropertyConfig> = {
    // ===== LAYOUT =====
    display: {
        id: 'display',
        name: 'Layout Mode',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'block',
        options: ['block', 'inline', 'flex', 'grid', 'inline-block', 'inline-flex', 'none'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'How this element behaves in the layout. Use "flex" to arrange children in rows or columns.'
    },

    position: {
        id: 'position',
        name: 'Position',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'static',
        options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'How this element is positioned. Use "relative" for slight offsets, "absolute" to place anywhere.'
    },

    flexDirection: {
        id: 'flexDirection',
        name: 'Content Direction',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'row',
        options: ['row', 'column'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Arrange children horizontally (row) or vertically (column). Requires Layout Mode: flex.'
    },

    justifyContent: {
        id: 'justifyContent',
        name: 'Distribute Content',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'flex-start',
        options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'How children are spaced along the main axis. Use "space-between" for even gaps.'
    },

    alignItems: {
        id: 'alignItems',
        name: 'Vertical Align',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'flex-start',
        options: ['flex-start', 'center', 'flex-end', 'stretch'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Align children vertically within this container. Use "center" to vertically center.'
    },

    flexWrap: {
        id: 'flexWrap',
        name: 'Wrap Content',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'nowrap',
        options: ['nowrap', 'wrap', 'wrap-reverse'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Whether children wrap to the next line when they overflow.'
    },

    // alignSelf removed - too confusing for users

    horizontalAlign: {
        id: 'horizontalAlign',
        name: 'Horizontal Align',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'left',
        options: ['left', 'center', 'right'],
        useToggleGroup: true,
        toCSSValue: (value) => {
            // Uses margin-left/right auto to position
            if (value === 'center') return { marginLeft: 'auto', marginRight: 'auto' };
            if (value === 'right') return { marginLeft: 'auto', marginRight: '0' };
            return { marginLeft: '0', marginRight: 'auto' };
        },
        fromCSSValue: () => 'left',
        description: 'Position this element left, center, or right within its parent.'
    },

    // ===== SPACING =====
    padding: {
        id: 'padding',
        name: 'Padding',
        category: 'Spacing',
        controlType: 'spacing',
        defaultValue: { top: 50, right: 50, bottom: 50, left: 50 },
        toCSSValue: ({ top, right, bottom, left }) =>
            `${top}px ${right}px ${bottom}px ${left}px`,
        fromCSSValue: (css) => {
            const parts = css.split(/\s+/).map(p => parseInt(p) || 0);
            return {
                top: parts[0] || 0,
                right: parts[1] || parts[0] || 0,
                bottom: parts[2] || parts[0] || 0,
                left: parts[3] || parts[1] || parts[0] || 0
            };
        },
        description: 'Inner spacing between content and the border. Increases element size.'
    },

    margin: {
        id: 'margin',
        name: 'Margin',
        category: 'Spacing',
        controlType: 'spacing',
        defaultValue: { top: 0, right: 0, bottom: 0, left: 0 },
        toCSSValue: ({ top, right, bottom, left }) =>
            `${top}px ${right}px ${bottom}px ${left}px`,
        fromCSSValue: (css) => {
            const parts = css.split(/\s+/).map(p => parseInt(p) || 0);
            return {
                top: parts[0] || 0,
                right: parts[1] || parts[0] || 0,
                bottom: parts[2] || parts[0] || 0,
                left: parts[3] || parts[1] || parts[0] || 0
            };
        },
        description: 'Outer spacing between this element and its neighbors.'
    },

    gap: {
        id: 'gap',
        name: 'Gap',
        category: 'Spacing',
        controlType: 'number',
        defaultValue: 30,
        unit: 'px',
        min: 0,
        max: 200,
        step: 5,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 30,
        description: 'Space between children in a flex or grid container.'
    },

    // ===== SIZING =====
    size: {
        id: 'size',
        name: 'Size',
        category: 'Sizing',
        controlType: 'sizing',
        defaultValue: { width: 'auto', height: 'auto', widthUnit: 'px', heightUnit: 'px' },
        toCSSValue: (value) => {
            const w = value.width === 'auto' ? 'auto' : `${value.width}${value.widthUnit}`;
            const h = value.height === 'auto' ? 'auto' : `${value.height}${value.heightUnit}`;
            return { width: w, height: h };
        },
        fromCSSValue: () => ({ width: 'auto', height: 'auto', widthUnit: 'px', heightUnit: 'px' }),
        description: 'Set width and height together. Use "auto" for natural sizing.'
    },

    width: {
        id: 'width',
        name: 'Width',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 'auto',
        unit: 'px',
        min: 0,
        toCSSValue: (value) => value === 'auto' ? 'auto' : `${value}px`,
        fromCSSValue: (css) => css === 'auto' ? 'auto' : parseInt(css) || 0,
        description: 'Fixed width of the element in pixels.'
    },

    height: {
        id: 'height',
        name: 'Height',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 'auto',
        unit: 'px',
        min: 0,
        toCSSValue: (value) => value === 'auto' ? 'auto' : `${value}px`,
        fromCSSValue: (css) => css === 'auto' ? 'auto' : parseInt(css) || 0,
        description: 'Fixed height of the element in pixels.'
    },

    minWidth: {
        id: 'minWidth',
        name: 'Min Width',
        category: 'Sizing',
        controlType: 'dimension',
        dimension: 'width',
        defaultValue: { value: 0, unit: 'px' },
        toCSSValue: (val) => {
            const v = val as { value: number | 'auto'; unit: string };
            return v.value === 'auto' ? 'auto' : `${v.value}${v.unit}`;
        },
        fromCSSValue: (css) => {
            if (css === 'auto') return { value: 'auto', unit: 'px' };
            const num = parseInt(css) || 0;
            const unit = css.includes('%') ? '%' : css.includes('vw') ? 'vw' : 'px';
            return { value: num, unit };
        },
        description: 'Minimum width - element will not shrink below this.'
    },

    maxWidth: {
        id: 'maxWidth',
        name: 'Max Width',
        category: 'Sizing',
        controlType: 'dimension',
        dimension: 'width',
        defaultValue: { value: 'none', unit: 'px' },
        toCSSValue: (val) => {
            const v = val as { value: number | 'none'; unit: string };
            return v.value === 'none' ? 'none' : `${v.value}${v.unit}`;
        },
        fromCSSValue: (css) => {
            if (css === 'none') return { value: 'none', unit: 'px' };
            const num = parseInt(css) || 0;
            const unit = css.includes('%') ? '%' : css.includes('vw') ? 'vw' : 'px';
            return { value: num, unit };
        },
        description: 'Maximum width - element will not grow beyond this.'
    },

    minHeight: {
        id: 'minHeight',
        name: 'Min Height',
        category: 'Sizing',
        controlType: 'dimension',
        dimension: 'height',
        defaultValue: { value: 0, unit: 'px' },
        toCSSValue: (val) => {
            const v = val as { value: number | 'auto'; unit: string };
            return v.value === 'auto' ? 'auto' : `${v.value}${v.unit}`;
        },
        fromCSSValue: (css) => {
            if (css === 'auto') return { value: 'auto', unit: 'px' };
            const num = parseInt(css) || 0;
            const unit = css.includes('vh') ? 'vh' : 'px';
            return { value: num, unit };
        },
        description: 'Minimum height - element will not shrink below this.'
    },

    maxHeight: {
        id: 'maxHeight',
        name: 'Max Height',
        category: 'Sizing',
        controlType: 'dimension',
        dimension: 'height',
        defaultValue: { value: 'none', unit: 'px' },
        toCSSValue: (val) => {
            const v = val as { value: number | 'none'; unit: string };
            return v.value === 'none' ? 'none' : `${v.value}${v.unit}`;
        },
        fromCSSValue: (css) => {
            if (css === 'none') return { value: 'none', unit: 'px' };
            const num = parseInt(css) || 0;
            const unit = css.includes('vh') ? 'vh' : 'px';
            return { value: num, unit };
        },
        description: 'Maximum height - element will not grow beyond this.'
    },

    // ===== TYPOGRAPHY =====
    fontSize: {
        id: 'fontSize',
        name: 'Font Size',
        category: 'Typography',
        controlType: 'number',
        defaultValue: 16,
        unit: 'px',
        min: 8,
        max: 72,
        step: 1,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 16,
        description: 'Size of the text in pixels.'
    },

    fontWeight: {
        id: 'fontWeight',
        name: 'Font Weight',
        category: 'Typography',
        controlType: 'select',
        defaultValue: '400',
        options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Thickness of text. 400 is normal, 700 is bold.'
    },

    lineHeight: {
        id: 'lineHeight',
        name: 'Line Height',
        category: 'Typography',
        controlType: 'number',
        defaultValue: 1.5,
        min: 1,
        max: 3,
        step: 0.1,
        toCSSValue: (value) => String(value),
        fromCSSValue: (css) => parseFloat(css) || 1.5,
        description: 'Vertical spacing between lines of text. 1.5 is comfortable reading.'
    },

    textAlign: {
        id: 'textAlign',
        name: 'Text Align',
        category: 'Typography',
        controlType: 'select',
        defaultValue: 'left',
        options: ['left', 'center', 'right', 'justify'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Horizontal alignment of text within the element.'
    },

    // ===== COLORS =====
    color: {
        id: 'color',
        name: 'Text Color',
        category: 'Typography',
        controlType: 'color',
        defaultValue: '#000000',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Color of the text inside this element.'
    },

    backgroundColor: {
        id: 'backgroundColor',
        name: 'Background Color',
        category: 'Backgrounds',
        controlType: 'color',
        defaultValue: 'transparent',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Fill color behind this element.'
    },

    borderColor: {
        id: 'borderColor',
        name: 'Border Color',
        category: 'Effects',
        controlType: 'color',
        defaultValue: '#000000',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Color of the border around this element.'
    },

    // ===== BACKGROUNDS =====
    backgroundImage: {
        id: 'backgroundImage',
        name: 'Image URL',
        category: 'Backgrounds',
        controlType: 'text',
        defaultValue: '',
        toCSSValue: (value) => value ? `url('${value}')` : 'none',
        fromCSSValue: (css) => {
            if (!css || css === 'none') return '';
            const match = css.match(/url\(['"]?(.+?)['"]?\)/);
            return match ? match[1] : '';
        },
        description: 'URL of the background image.'
    },

    backgroundSize: {
        id: 'backgroundSize',
        name: 'Size',
        category: 'Backgrounds',
        controlType: 'select',
        defaultValue: 'cover',
        options: ['cover', 'contain', 'auto', '100% 100%'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'How the image is resized. Cover fills the area.'
    },

    backgroundPosition: {
        id: 'backgroundPosition',
        name: 'Position',
        category: 'Backgrounds',
        controlType: 'select',
        defaultValue: 'center',
        options: ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Where the image is placed within the element.'
    },

    // ===== EFFECTS =====
    opacity: {
        id: 'opacity',
        name: 'Opacity',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        toCSSValue: (value) => String(value),
        fromCSSValue: (css) => parseFloat(css) || 1,
        description: 'Transparency level. 1 is fully visible, 0 is invisible.'
    },

    borderRadius: {
        id: 'borderRadius',
        name: 'Border Radius',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 0,
        unit: 'px',
        min: 0,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0,
        description: 'Rounds the corners. Higher values = more rounded.'
    },

    boxShadow: {
        id: 'boxShadow',
        name: 'Box Shadow',
        category: 'Effects',
        controlType: 'composite',
        defaultValue: { x: 0, y: 0, blur: 0, spread: 0, color: 'rgba(0,0,0,0.3)' },
        fields: [
            { name: 'x', controlType: 'number', unit: 'px' },
            { name: 'y', controlType: 'number', unit: 'px' },
            { name: 'blur', controlType: 'number', unit: 'px', min: 0 },
            { name: 'spread', controlType: 'number', unit: 'px' },
            { name: 'color', controlType: 'color' }
        ],
        toCSSValue: ({ x, y, blur, spread, color }) =>
            `${x}px ${y}px ${blur}px ${spread}px ${color}`,
        fromCSSValue: (css) => {
            const parts = css.trim().split(/\s+/);
            return {
                x: parseInt(parts[0]) || 0,
                y: parseInt(parts[1]) || 0,
                blur: parseInt(parts[2]) || 0,
                spread: parseInt(parts[3]) || 0,
                color: parts.slice(4).join(' ') || 'rgba(0,0,0,0.3)'
            };
        },
        description: 'Drop shadow effect. Set blur and y-offset for a nice elevation look.'
    },

    borderWidth: {
        id: 'borderWidth',
        name: 'Border Width',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 0,
        unit: 'px',
        min: 0,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0,
        description: 'Thickness of the border around this element.'
    },

    borderStyle: {
        id: 'borderStyle',
        name: 'Border Style',
        category: 'Effects',
        controlType: 'select',
        defaultValue: 'solid',
        options: ['none', 'solid', 'dashed', 'dotted', 'double'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Type of border line - solid, dashed, dotted, etc.'
    }
};

// Category organization
export const CSS_CATEGORIES = {
    'Layout': ['display', 'position', 'flexDirection', 'justifyContent', 'alignItems', 'flexWrap', 'horizontalAlign'],
    'Spacing': ['padding', 'margin', 'gap'],
    'Sizing': ['size', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'],
    'Typography': ['fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'color'],
    'Backgrounds': ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition'],
    'Effects': ['opacity', 'borderRadius', 'borderColor', 'boxShadow', 'borderWidth', 'borderStyle']
};

// Helper to get all properties by category
export const getPropertiesByCategory = (category: string): CSSPropertyConfig[] => {
    const propertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
    return propertyIds.map(id => CSS_PROPERTY_CONFIGS[id]).filter(Boolean);
};

// Helper to get all categories
export const getAllCategories = (): string[] => {
    return Object.keys(CSS_CATEGORIES);
};
