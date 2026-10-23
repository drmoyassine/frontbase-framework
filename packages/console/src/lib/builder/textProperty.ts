/** Text aliases share one authored field across canvas, properties and mapping. */
export function canonicalTextProperty(type:string,props:Record<string,unknown>):string {
    if (!['Text','Heading','Paragraph'].includes(type)) return 'text';
    // Match the shared renderer's legacy fallback order before choosing an empty field.
    if (props.content) return 'content';
    if (props.text) return 'text';
    if (type==='Text' && props.value) return 'value';
    if (Object.prototype.hasOwnProperty.call(props,'content')) return 'content';
    if (Object.prototype.hasOwnProperty.call(props,'text')) return 'text';
    return type==='Heading'?'text':'content';
}
export function canonicalTextFields<T extends {name:string}>(fields:T[],type:string,props:Record<string,unknown>):T[] {
    if(!['Text','Heading','Paragraph'].includes(type))return fields;
    return fields.map(field=>field.name==='text'||field.name==='content'?{...field,name:canonicalTextProperty(type,props)}:field);
}

/** Clearing the active field must not resurrect a stale renderer fallback. */
export function textAliasReset(type:string,field:string):Record<string,string> {
    const aliases=type==='Text'?['content','text','value']:['Heading','Paragraph'].includes(type)?['content','text']:[];
    return aliases.includes(field)?Object.fromEntries(aliases.filter(alias=>alias!==field).map(alias=>[alias,''])):{};
}
