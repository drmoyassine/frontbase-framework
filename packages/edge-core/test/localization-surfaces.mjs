import assert from 'node:assert/strict';
import { homepageDisplayFields, applyHomepageDisplayFields } from '@frontbase/edge-core/localization';
import { applyBlockVersion, resolveBlockTree } from '@frontbase/edge-core/block-versions';

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
const valuesFor = fields => new Map(fields.map(candidate => [JSON.stringify([candidate.blockId, candidate.versionId ?? 'default', candidate.path]), 'عربي ' + candidate.text]));
const projected = applyHomepageDisplayFields(layout, valuesFor(homepageDisplayFields(layout)));
assert.equal(projected.content[0].props.initialRows[2].title, 'عربي Gamma Institute');
assert.throws(() => applyHomepageDisplayFields(layout, new Map()), /translation_coverage_incomplete/);

// Block Versions: inherited fields share Default units; explicit overrides own theirs.
const versioned = { id: 'seasonal', type: 'Heading', props: { text: 'Find your program', ariaLabel: 'Programs' },
    versions: [
        { id: 'winter', name: 'Winter', when: 'user.authenticated', overrides: { props: { text: 'Winter programs' } } },
        { id: 'spring', name: 'Spring', when: 'visitor.season', overrides: { props: { ariaLabel: 'Spring programs' } } },
        { id: 'echo', name: 'Echo', when: 'visitor.echo', overrides: { props: { text: 'Find your program' } } }] };
const wrap = { id: 'wrap', type: 'Section', props: {}, children: [{ id: 'cta', type: 'Button', props: { text: 'Apply now' } }],
    versions: [{ id: 'members', name: 'Members', when: 'user.authenticated', overrides: { children: [{ id: 'cta2', type: 'Button', props: { text: 'Members apply' } }] } }] };
const versionedFields = homepageDisplayFields({ content: [versioned, wrap] });
const byText = text => versionedFields.filter(candidate => candidate.text === text);
assert.deepEqual(byText('Find your program').map(candidate => candidate.versionId), [undefined], 'the Default text stays the Default unit');
assert.deepEqual(byText('Programs').map(candidate => candidate.versionId), [undefined]);
assert.deepEqual(byText('Winter programs').map(candidate => candidate.versionId), ['winter']);
assert.deepEqual(byText('Spring programs').map(candidate => candidate.versionId), ['spring'], 'an overridden sibling field owns its unit without dragging inherited ones');
assert.equal(byText('Find your program').length, 1, 'an alternative overriding text with the Default text adds no unit');
assert.deepEqual(versionedFields.find(candidate => candidate.blockId === 'cta2'), { blockId: 'cta2', path: ['props', 'text'], text: 'Members apply', label: 'Button', versionId: 'members' }, 'override children are version-owned structure');

// Projection writes overrides without displacing inherited siblings.
const versionedLayout = { content: [structuredClone(versioned), structuredClone(wrap)] };
const projectedVersioned = applyHomepageDisplayFields(versionedLayout, valuesFor(homepageDisplayFields(versionedLayout)));
const seasonal = projectedVersioned.content[0], wrapped = projectedVersioned.content[1];
assert.equal(seasonal.props.text, 'عربي Find your program');
assert.equal(seasonal.versions.find(candidate => candidate.id === 'winter').overrides.props.text, 'عربي Winter programs');
assert.equal(seasonal.versions.find(candidate => candidate.id === 'spring').overrides.props.ariaLabel, 'عربي Spring programs');
const winter = applyBlockVersion(seasonal, 'winter');
assert.equal(winter.props.text, 'عربي Winter programs');
assert.equal(winter.props.ariaLabel, 'عربي Programs', 'un-overridden siblings keep the translated Default value');
assert.equal(applyBlockVersion(seasonal, 'spring').props.text, 'عربي Find your program');
assert.equal(wrapped.versions.find(candidate => candidate.id === 'members').overrides.children[0].props.text, 'عربي Members apply', 'override-child fields write into the alternative structure');

// Serving-time selection renders the released text of whichever version the request selects.
const authenticated = () => true, anonymous = () => undefined;
assert.equal(resolveBlockTree([seasonal], authenticated)[0].props.text, 'عربي Winter programs');
assert.equal(resolveBlockTree([seasonal], anonymous)[0].props.text, 'عربي Find your program');
console.log('localization display surfaces PASS: record identity extraction, reorder stability, shared-identity positions, positional fallback, coverage-refusing projection and Block Version inheritance identity');
