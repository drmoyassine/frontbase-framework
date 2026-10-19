import assert from 'node:assert/strict';
import { homepageDisplayFields, applyHomepageDisplayFields } from '@frontbase/edge-core/localization';

const repeater = (rows, id = 'list') => ({ id, type: 'Repeater',
    props: { binding: { componentId: id, dataSourceId: 'frontbase:publication', tableName: 'institutions', source: { kind: 'publication', hash: 'a'.repeat(64) } },
        ...(rows ? { initialRows: rows } : {}) },
    children: [{ id: 't', type: 'Heading', props: { text: '{{ record.title }}' } }] });
const field = (fields, path) => fields.find(candidate => candidate.blockId === 'list' && candidate.path.at(-1) === path);
const identity = record => JSON.stringify(record);

// Bound rows carry their record identity; order changes never move it.
const rows = [{ id: 'i1', title: 'Alpha University' }, { id: 'i2', title: 'Beta College' }, { id: 3, title: 'Gamma Institute' }];
const fields = homepageDisplayFields({ content: [repeater(rows)] });
assert.deepEqual(field(fields, 'title').record, { connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 'i1' }] });
assert.equal(fields.find(candidate => candidate.text === 'Gamma Institute').record.key[0].value, 3, 'numeric ids stay numeric');
const reordered = homepageDisplayFields({ content: [repeater([...rows].reverse())] });
assert.deepEqual(reordered.find(candidate => candidate.text === 'Gamma Institute').record,
    { connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 3 }] });
assert.deepEqual([...fields].sort((a, b) => a.text < b.text ? -1 : 1).map(candidate => [identity(candidate.record), candidate.text]),
    [...reordered].sort((a, b) => a.text < b.text ? -1 : 1).map(candidate => [identity(candidate.record), candidate.text]), 'reordering keeps identity attached to its text');

// Two lists rendering the same records share one identity.
const twin = homepageDisplayFields({ content: [repeater(rows), repeater(rows, 'list2')] });
assert.equal(new Set(twin.map(candidate => identity(candidate.record) + candidate.text)).size, twin.length / 2, 'the same record field surfaces one identity per position');

// Rows without a usable id, and unbound lists, stay positional.
assert.equal(field(homepageDisplayFields({ content: [repeater([{ id: '', title: 'No id' }])] }), 'title').record, undefined);
assert.equal(field(homepageDisplayFields({ content: [repeater([{ id: 'bad\nid', title: 'Control' }])] }), 'title').record, undefined);
assert.equal(field(homepageDisplayFields({ content: [repeater([{ title: 'Missing id' }])] }), 'title').record, undefined);
assert.equal(field(homepageDisplayFields({ content: [{ ...repeater([{ id: 'i1', title: 'Alpha University' }]), props: { initialRows: [{ id: 'i1', title: 'Alpha University' }] } }] }), 'title').record, undefined, 'no binding, no record identity');
const partial = { id: 'list', type: 'Repeater', props: { binding: { dataSourceId: 'frontbase:publication', source: { kind: 'publication', hash: 'a'.repeat(64) } }, initialRows: [{ id: 'i1', title: 'Alpha University' }] }, children: [] };
assert.equal(field(homepageDisplayFields({ content: [partial] }), 'title').record, undefined, 'a binding without a collection is not record identity');

// Projection still applies values at their rendered positions.
const layout = { content: [repeater(rows)] };
const projected = applyHomepageDisplayFields(layout, new Map(homepageDisplayFields(layout).map(candidate => [JSON.stringify([candidate.blockId, candidate.path]), 'عربي ' + candidate.text])));
assert.equal(projected.content[0].props.initialRows[2].title, 'عربي Gamma Institute');
assert.throws(() => applyHomepageDisplayFields(layout, new Map()), /translation_coverage_incomplete/);
console.log('localization display surfaces PASS: record identity extraction, reorder stability, shared-identity positions, positional fallback and coverage-refusing projection');
