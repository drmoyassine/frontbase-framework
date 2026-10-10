import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const resource = z.object({ source: z.enum(['compat','framework','template','directory','blog','institution','program','article']), id: z.string().max(200), path: z.string().max(400), deleted: z.boolean() }).strict();
const common = { schemaVersion: z.literal(1), coverage: z.enum(['stored-pages','stored-pages-and-active-capture']), publicRecordsChecked: z.boolean(), installAvailable: z.literal(false),
    capture: z.object({schemaVersion:z.literal(1),generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional() };
const reportSchema = z.union([
    z.object({ ...common, status: z.enum(['clear','conflicts']), issues: z.array(z.object({ code: z.enum(['unsupported_path','reserved_path','route_conflict','potential_alias_conflict']), resources: z.array(resource).max(50) }).strict()).max(100), resourcesChecked: z.number().int().nonnegative(), truncated: z.boolean() }).strict(),
    z.object({ ...common, status: z.literal('unavailable'), code: z.enum(['namespace_unavailable','namespace_changed','namespace_too_large','namespace_invalid']) }).strict(),
]).refine(value => value.coverage === 'stored-pages' ? !value.publicRecordsChecked && !value.capture : value.publicRecordsChecked && !!value.capture);
const labels = { unsupported_path: 'Address needs review', reserved_path: 'Reserved address', route_conflict: 'Duplicate address', potential_alias_conflict: 'Possible case or slash conflict' };

/** Mounted with an identity key: account/owner changes discard the entire view. */
export function PageRouteAudit() {
    const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
    const [report, setReport] = useState<z.infer<typeof reportSchema>>(), [error, setError] = useState('');
    const request = useRef<AbortController | undefined>(undefined), generation = useRef(0);
    useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
    function close(value: boolean) {
        setOpen(value);
        if (!value) { generation.current++; request.current?.abort(); setPending(false); setReport(undefined); setError(''); }
    }
    async function check() {
        request.current?.abort(); const controller = new AbortController(); request.current = controller;
        const run = ++generation.current; setOpen(true); setPending(true); setReport(undefined); setError('');
        try {
            const response = await fetch('/api/project/page-route-audit/', { credentials: 'include', cache: 'no-store', signal: controller.signal });
            if (![200,503].includes(response.status)) throw new Error();
            const parsed = reportSchema.parse(await response.json());
            if ((response.status === 503) !== (parsed.status === 'unavailable')) throw new Error();
            if (run !== generation.current || controller.signal.aborted) return;
            setReport(parsed);
        } catch {
            if (run === generation.current && !controller.signal.aborted) setError('Unable to check page URLs. Confirm administrator access and try again.');
        } finally { if (run === generation.current && !controller.signal.aborted) setPending(false); }
    }
    return <>
        <Button variant="outline" onClick={check}>Check page URLs</Button>
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader><DialogTitle>Page URL checks</DialogTitle><DialogDescription>Checks stored pages, including trash and legacy drafts. When a published site capture exists, its listing and blog URLs are included. Uncaptured and draft records are not included. Nothing is changed.</DialogDescription></DialogHeader>
                <div aria-live="polite" className="space-y-3 min-w-0">
                    {pending && <p>Checking page URLs…</p>}
                    {error && <p role="alert">{error}</p>}
                    {report?.status === 'unavailable' && <p role="alert">{report.code === 'namespace_changed' ? 'Pages changed during the check. Run it again.' : 'The page inventory could not be checked. Review the connection or inventory limits and try again.'}</p>}
                    {report && report.status !== 'unavailable' && <>
                        <p className="text-sm text-muted-foreground break-all">{report.capture ? `Includes published capture ${report.capture.hash}, generation ${report.capture.generation}.` : 'No published capture: listing and blog record URLs were not checked.'}</p>
                        <p>{report.status === 'clear' ? 'No conflicts found in the checked page inventory.' : 'These page addresses need review.'} Checked {report.resourcesChecked} address claims.</p>
                        {report.truncated && <p role="alert">The report is shortened. More conflicts need review.</p>}
                        <ul className="space-y-3">{report.issues.map((issue, index) => <li key={index} className="rounded-md border p-3 space-y-1">
                            <p className="font-medium">{labels[issue.code]}</p>
                            {issue.resources.map((item, i) => <p key={i} className="text-sm break-all">{item.path || 'Unsupported spelling'} · {item.source} {item.id}{item.deleted ? ' (in trash)' : ''}</p>)}
                        </li>)}</ul>
                        <p className="text-sm text-muted-foreground">This is a read-only inventory check, not migration completeness or installation approval.</p>
                    </>}
                </div>
                <Button variant="outline" onClick={check} disabled={pending}>Check again</Button>
            </DialogContent>
        </Dialog>
    </>;
}
