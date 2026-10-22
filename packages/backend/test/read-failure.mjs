import assert from 'node:assert/strict';
import {readFailureReason,reportReadFailure} from '../dist/compat/read-failure.js';
const cases=[['TimeoutError: secret-token','timeout'],['fetch failed https://private.example?key=secret-token','transport'],['SQLITE_BUSY secret-token','state_busy'],['live_list_unavailable','live_query'],['invalid_live_list_response','invalid_live_result'],['locale_unavailable','locale_integrity'],['reviewed_homepage_required','reviewed_source_required'],['homepage_unavailable','source_unavailable'],['secret-token SELECT private_data','unclassified']];
const entries=[],original=console.warn;console.warn=(...args)=>entries.push(args);
try{for(const [message,expected]of cases){assert.equal(readFailureReason(new Error(message)),expected);reportReadFailure('single-table',new Error(message));}assert.equal(readFailureReason({message:'secret-token'}),'unclassified');}finally{console.warn=original;}
assert.doesNotMatch(JSON.stringify(entries),/secret-token|private.example|SELECT|private_data/);
assert.equal(entries.length,cases.length);console.log('read failure diagnostics: PASS');
