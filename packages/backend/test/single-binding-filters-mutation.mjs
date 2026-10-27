import {withSourceMutation,buildPackage,runGate,expectRed,summarize,repoRoot} from '../../../scripts/mutation-lib.mjs';
const dir=repoRoot+'packages/backend/';
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/single-binding-filters.mjs')!==0)process.exit(2);
await withSourceMutation('legacy data reads apply the resolved filters','packages/backend/src/compat/routes/database.ts',
    "const where=buildWhere(source.dialect,schema.columns,filters,c.req.query('search')??(!Array.isArray(parsed)?parsed.search:undefined));",
    "const where={sql:'',params:[]};",async()=>{if(!buildPackage('@frontbase/backend'))throw Error('mutation failed to build');expectRed('legacy data reads apply the resolved filters',runGate(dir,'test/single-binding-filters.mjs'));});
await withSourceMutation('shared filter columns are schema validated','packages/backend/src/compat/routes/sync.ts',
    "const field = validateIdentifier(String(filter.field ?? filter.column ?? ''), columnNames);","const field=String(filter.field ?? filter.column ?? '');",async()=>{if(!buildPackage('@frontbase/backend'))throw Error('mutation failed to build');expectRed('shared filter columns are schema validated',runGate(dir,'test/single-binding-filters.mjs'));});
if(!buildPackage('@frontbase/backend')||runGate(dir,'test/single-binding-filters.mjs')!==0)process.exit(2);
summarize('single-binding filter mutations');
