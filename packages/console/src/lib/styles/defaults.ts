import type { StylesData } from '@/types/builder';

/**
 * Get default styles for new pages
 */
export const getDefaultPageStyles = (): StylesData => {
    return {
        activeProperties: [
            'flexDirection',
            'gap',
            'flexWrap',
            'alignItems',
            'justifyContent',
            'backgroundColor',
            'padding',
            'size'
        ],
        values: {
            flexDirection: 'column',
            gap: 30,
            flexWrap: 'nowrap',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            backgroundColor: '#FFFFFF',
            padding: {
                top: 50,
                right: 50,
                bottom: 50,
                left: 50
            },
            size: {
                width: 'auto',
                height: 'auto',
                widthUnit: 'px',
                heightUnit: 'px'
            }
        },
        stylingMode: 'visual'
    };
};
