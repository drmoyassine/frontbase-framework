/**
 * Registry Tests
 *
 * Tests for the component registry functionality.
 */

import { strict as assert } from 'node:assert';
import { globalRegistry, registerComponents } from '../dist/registry/index.js';

let pass = 0, fail = 0;
const ok = (label, cond) => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
};

async function run() {
    console.log('\n=== Registry Tests ===\n');

    // Register all components
    await registerComponents();

    // Test 1: Registry has components registered
    ok('Registry has 20+ components registered', globalRegistry.size >= 20);

    // Test 2: Basic components exist
    ok('Button component exists', globalRegistry.has('Button'));
    ok('Text component exists', globalRegistry.has('Text'));
    ok('Heading component exists', globalRegistry.has('Heading'));
    ok('Image component exists', globalRegistry.has('Image'));
    ok('Container component exists', globalRegistry.has('Container'));
    ok('Navbar component exists', globalRegistry.has('Navbar'));
    ok('Footer component exists', globalRegistry.has('Footer'));

    // Test 3: Layout components exist
    ok('Row component exists', globalRegistry.has('Row'));
    ok('Column component exists', globalRegistry.has('Column'));
    ok('Section component exists', globalRegistry.has('Section'));
    ok('Stack component exists', globalRegistry.has('Stack'));

    // Test 4: Form components exist
    ok('Input component exists', globalRegistry.has('Input'));
    ok('Textarea component exists', globalRegistry.has('Textarea'));
    ok('Select component exists', globalRegistry.has('Select'));

    // Test 5: Data components exist
    ok('DataTable component exists', globalRegistry.has('DataTable'));
    ok('Chart component exists', globalRegistry.has('Chart'));

    // Test 6: Landing components exist
    ok('Hero component exists', globalRegistry.has('Hero'));
    ok('Features component exists', globalRegistry.has('Features'));
    ok('Pricing component exists', globalRegistry.has('Pricing'));
    ok('CTA component exists', globalRegistry.has('CTA'));

    // Test 7: Can get component definitions
    const buttonDef = globalRegistry.get('Button');
    ok('Button definition exists', buttonDef !== undefined);
    ok('Button has eSSR renderer', typeof buttonDef?.eSSRRenderer === 'function');

    // Test 8: Can render components
    const buttonHtml = globalRegistry.renderComponent('Button', { label: 'Test' });
    ok('Button renders HTML', buttonHtml.includes('Test'));
    ok('Button has fb-button class', buttonHtml.includes('fb-button'));

    // Test 9: Can validate props
    const validResult = globalRegistry.validateProps('Button', { label: 'Test', variant: 'default' });
    ok('Valid Button props pass validation', validResult.valid === true);

    const invalidResult = globalRegistry.validateProps('Button', { variant: 'invalid' });
    ok('Invalid Button props fail validation', invalidResult.valid === false);

    // Test 10: Can get defaults
    const buttonDefaults = globalRegistry.getDefaults('Button');
    ok('Button has defaults', Object.keys(buttonDefaults).length > 0);
    ok('Button default label is correct', buttonDefaults.label === 'Click me');

    // Test 11: Can create instance
    const instance = globalRegistry.createInstance('Button');
    ok('Button instance created', instance.id !== undefined);
    ok('Button instance has correct type', instance.type === 'Button');

    // Test 12: Export for Agent
    const agentExport = globalRegistry.exportForAgent();
    ok('Export is non-empty array', Array.isArray(agentExport) && agentExport.length > 0);
    ok('Export includes Button', agentExport.some(c => c.type === 'Button'));
    ok('Export has required fields', agentExport.every(c => c.type && c.displayName && c.props && c.category));

    // Test 13: Can check parent-child compatibility
    ok('Text can be child of Container', globalRegistry.canBeChild('Text', 'Container'));
    ok('Container can be parent of Text', globalRegistry.canBeChild('Text', 'Container'));

    // Test 14: List by category
    const basicComponents = globalRegistry.listByCategory('basic');
    ok('Basic category has components', basicComponents.length > 0);
    ok('Basic includes Button', basicComponents.some(c => c.type === 'Button'));

    // Test 15: Search works
    const searchResults = globalRegistry.search('button');
    ok('Search finds Button', searchResults.some(c => c.type === 'Button'));

    console.log(`\nRegistry Tests: ${pass}/${pass + fail}${fail ? ' — FAILING' : ' — GREEN ✅'}`);
}

run().then(() => process.exit(fail ? 1 : 0)).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
