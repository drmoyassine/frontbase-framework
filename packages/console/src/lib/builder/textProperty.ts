/** Text aliases share one authored field across canvas, properties and mapping. */
export function canonicalTextProperty(type:string,props:Record<string,unknown>):string {
    if (!['Text','Heading','Paragraph'].includes(type)) return 'text';
    if (Object.prototype.hasOwnProperty.call(props,'content')) return 'content';
    if (Object.prototype.hasOwnProperty.call(props,'text')) return 'text';
    return type==='Heading'?'text':'content';
}
export function canonicalTextFields<T extends {name:string}>(fields:T[],type:string,props:Record<string,unknown>):T[] {
    if(!['Text','Heading','Paragraph'].includes(type))return fields;
    return fields.map(field=>field.name==='text'||field.name==='content'?{...field,name:canonicalTextProperty(type,props)}:field);
}
