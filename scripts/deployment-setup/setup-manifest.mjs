// Only nonsecret selections cross an OAuth navigation. Server-side review remains authoritative.
const canonical=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):Array.isArray(value)?value.map(canonical):value;
export function pendingSetupManifest(manifest,defaults){
 return {manifest,inheritDefaults:Object.keys(defaults.bindings).filter(role=>JSON.stringify(canonical(manifest.bindings[role]))===JSON.stringify(canonical(defaults.bindings[role])))};
}
export function restoreSetupManifest(saved,defaults){
 const manifest=saved?.manifest??saved;if(manifest?.target!==defaults.target||manifest?.environment!==defaults.environment||!manifest.bindings)return defaults;
 const restored=structuredClone(manifest);for(const role of saved?.inheritDefaults??[])if(Object.hasOwn(defaults.bindings,role))restored.bindings[role]=structuredClone(defaults.bindings[role]);return restored;
}
