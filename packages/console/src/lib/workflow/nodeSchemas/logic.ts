/**
 * Logic Node Schemas — condition
 */
import type { NodeSchema, SelectFieldDefinition } from './types';

export const conditionSchema: NodeSchema = {
    type: 'condition',
    label: 'Condition',
    description: 'Route data based on conditions',
    category: 'logic',
    inputs: [
        {
            name: 'conditions',
            type: 'conditionBuilder',
            label: 'Routing Rules',
            description: 'Add conditions to create output routes. Data flows to the first matching condition, or "else" if none match.',
            default: [
                {
                    id: 'cond-default-1',
                    name: 'Condition 1',
                    field: '',
                    operator: 'equals',
                    value: '',
                },
            ],
        },
        {
            name: 'fallbackBehavior',
            type: 'select',
            label: 'When No Match',
            default: 'else',
            description: 'What to do when no conditions match',
            options: [
                { value: 'else', label: 'Route to "else" output' },
                { value: 'stop', label: 'Stop workflow' },
                { value: 'error', label: 'Throw error' },
            ],
        } as SelectFieldDefinition,
    ],
    // Outputs are dynamic based on conditions - this is the default
    // The actual outputs will be generated from the conditions array
    outputs: [
        { name: 'Condition 1', type: 'any', description: 'First condition matches' },
        { name: 'else', type: 'any', description: 'No conditions matched' },
    ],
};
