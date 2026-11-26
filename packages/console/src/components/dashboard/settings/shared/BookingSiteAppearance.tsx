import { useEffect, useState } from 'react';
import { bookingPaletteSchema, templatePalette, defaultTemplateSettings, type BookingPalette } from '@frontbase/edge-core/directory/configuration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const endpoint = '/api/project/booking-palette/';
const names = { primary: 'Primary accent', background: 'Page background', surface: 'Card and footer background', text: 'Text', muted: 'Secondary text', border: 'Border' } as const;
const initial: BookingPalette = { preset: 'navy', colors: {} };

export function BookingSiteAppearance() {
    const [draft, setDraft] = useState<BookingPalette>(initial);
    const [saved, setSaved] = useState<BookingPalette | null>();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [previewPath, setPreviewPath] = useState('/');
    const [previewUrl, setPreviewUrl] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await fetch(endpoint, { signal: controller.signal });
                if (!response.ok) throw Error();
                const value = bookingPaletteSchema.nullable().parse((await response.json()).palette);
                setSaved(value);
                setDraft(value ?? initial);
            } catch {
                if (!controller.signal.aborted) setMessage('Could not load the site palette. Refresh the page before editing.');
            }
        }
        void load();
        return () => controller.abort();
    }, []);

    const validation = bookingPaletteSchema.safeParse(draft);
    const changed = JSON.stringify(saved) !== JSON.stringify(draft);
    const preset = templatePalette({ ...defaultTemplateSettings(), preset: draft.preset });

    async function preview() {
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch('/api/project/live-layout/');
            if (!response.ok) throw Error();
            const { pointer } = await response.json();
            if (!pointer?.hash) {
                setMessage('Publish your Booking for X layout before previewing its palette.');
                return;
            }
            const query = new URLSearchParams({ hash: pointer.hash, path: previewPath, palette: JSON.stringify(draft) });
            setPreviewUrl('/api/project/live-layout/render/?' + query);
        } catch {
            setMessage('Could not open the site preview.');
        } finally {
            setBusy(false);
        }
    }

    async function save(palette: BookingPalette | null) {
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ palette }),
            });
            const body = await response.json();
            if (!response.ok) throw Error(body.detail || 'Could not save the site palette.');
            const next = bookingPaletteSchema.nullable().parse(body.palette);
            setSaved(next);
            setDraft(next ?? initial);
            setMessage(next ? 'Site palette applied.' : 'Original template colors restored.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not save the site palette.');
        } finally {
            setBusy(false);
        }
    }

    return <Card id="site-appearance" className="max-w-4xl">
        <CardHeader>
            <CardTitle>Site appearance</CardTitle>
            <CardDescription>Shared colors for Booking for X pages, header and footer. Colors set on individual components take precedence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <fieldset className="space-y-4" disabled={busy || saved === undefined}>
                <label className="block text-sm">Preset
                    <select className="mt-1 block w-full rounded border bg-background px-3 py-2" value={draft.preset}
                        onChange={event => setDraft({ ...draft, preset: event.target.value === 'charcoal' ? 'charcoal' : 'navy' })}>
                        <option value="navy">Neutral Navy</option>
                        <option value="charcoal">Neutral Charcoal</option>
                    </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.keys(names) as (keyof typeof names)[]).map(key => <label className="block text-sm" key={key}>
                        {names[key]}
                        <Input className="mt-1" placeholder={preset[key]} maxLength={7} value={draft.colors[key] ?? ''} onChange={event => {
                            const value = event.target.value.trim();
                            setDraft(current => {
                                const colors = { ...current.colors };
                                if (value) colors[key] = value;
                                else delete colors[key];
                                return { ...current, colors };
                            });
                        }} />
                    </label>)}
                </div>
            </fieldset>
            {!validation.success && <p className="text-sm text-destructive" role="alert">
                {validation.error.issues[0]?.code === 'custom' ? validation.error.issues[0].message : 'Enter colors as six-digit hex values, such as #123052.'}
            </p>}
            <p className="text-sm text-muted-foreground">Applying the palette updates the public site in every language.</p>
            <div className="flex flex-wrap gap-2">
                <Button disabled={busy || saved === undefined || !validation.success || !changed}
                    onClick={() => void save(draft)}>Apply palette</Button>
                <Button variant="outline" disabled={busy || !saved} onClick={() => void save(null)}>Restore original colors</Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label className="block text-sm">Preview path
                    <Input className="mt-1" placeholder="/ar/" value={previewPath} onChange={event => setPreviewPath(event.target.value)} />
                </label>
                <Button variant="outline" disabled={busy || saved === undefined || !validation.success
                    || !previewPath.startsWith('/') || previewPath.startsWith('//')} onClick={() => void preview()}>Preview palette</Button>
            </div>
            {previewUrl && <iframe title="Site palette preview" sandbox="" src={previewUrl} className="h-96 w-full rounded border" />}
            {message && <p role="status">{message}</p>}
        </CardContent>
    </Card>;
}
