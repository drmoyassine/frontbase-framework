import type {ComponentDataBinding} from '@/hooks/data/useSimpleData';

export function ListPresentationOptions({binding,onChange}:{binding:ComponentDataBinding;onChange:(patch:Partial<ComponentDataBinding>)=>void}) {
    const value=binding.presentation??{};
    const update=(patch:Partial<typeof value>)=>onChange({presentation:{...value,...patch}});
    return <section className="space-y-3 rounded border p-4" aria-label="List controls and states">
        <p className="font-medium">Controls and states</p>
        {(['count','refresh'] as const).map(key=><label key={key} className="flex justify-between text-sm">{key==='count'?'Record count':'Refresh button'}<input type="checkbox" checked={value[key]!==false} onChange={event=>update({[key]:event.target.checked})}/></label>)}
        {(['searchLabel','searchPlaceholder','loadingText','emptyText','errorText'] as const).map(key=><label className="block text-sm" key={key}>{{searchLabel:'Search label',searchPlaceholder:'Search placeholder',loadingText:'Loading message',emptyText:'Empty message',errorText:'Error message'}[key]}<input className="mt-1 w-full rounded border bg-background p-2" value={value[key]??''} onChange={event=>update({[key]:event.target.value})}/></label>)}
        <label className="block text-sm">Pagination position<select className="mt-1 w-full rounded border bg-background p-2" value={value.paginationPosition??'bottom'} onChange={event=>update({paginationPosition:event.target.value as 'top'|'bottom'|'both'})}><option value="top">Above records</option><option value="bottom">Below records</option><option value="both">Above and below</option></select></label>
    </section>;
}
