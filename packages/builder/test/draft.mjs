/**
 * localDraftProvider test — implements the DataProvider contract; RULE 3 reads
 * return copies (the canvas mutating a draft doesn't corrupt the store).
 */
import { localDraftProvider } from '../dist/draft/localDraftProvider.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const draft = localDraftProvider({ 'docs.list': [{ id: '1', title: 'Draft doc' }] });

const rows = await draft.query('docs.list');
check('query returns draft rows', rows.length === 1 && rows[0].title === 'Draft doc');
check('kind is "draft"', draft.kind === 'draft');

// unknown queryId → empty (no throw)
check('unknown query → empty', (await draft.query('nope')).length === 0);

// RULE 3: mutating a returned row doesn't affect the store
rows[0].title = 'MUTATED';
const fresh = await draft.query('docs.list');
check('RULE 3: returned rows are copies', fresh[0].title === 'Draft doc');

// _set writes (and copies in)
draft._set('docs.list', [{ id: '2', title: 'New' }]);
const set = await draft.query('docs.list');
check('_set writes draft rows', set.length === 1 && set[0].title === 'New');

console.log(failures === 0 ? '\ndraft: PASS ✅' : `\ndraft: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
