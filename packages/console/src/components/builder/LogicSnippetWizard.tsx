import React, { useMemo, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { VariableInput } from './VariableInput';
import {
    LogicSnippet, SnippetValues, ConditionValue, BranchValue, CONDITION_OPERATORS,
    isSnippetValid, initialSnippetValues,
} from '@/lib/liquid/logicSnippets';

interface LogicSnippetWizardProps {
    snippet: LogicSnippet | null;
    open: boolean;
    onClose: () => void;
    /** Insert the assembled Liquid; caretOffset points at the body gap. */
    onInsert: (text: string, caretOffset?: number) => void;
}

/**
 * Mini-wizard for the "Logic & Loops" snippets. The user fills plain-language
 * fields (condition builder / variable pickers / text) and gets complete, valid
 * Liquid — never raw `{%  %}` gaps. Lives next to VariablePicker so it works in
 * both the canvas inline editor and the properties-panel pickers.
 */
export const LogicSnippetWizard: React.FC<LogicSnippetWizardProps> = ({
    snippet, open, onClose, onInsert,
}) => {
    const [values, setValues] = useState<SnippetValues>({});

    // Reset values whenever a new snippet opens.
    React.useEffect(() => {
        if (snippet && open) setValues(initialSnippetValues(snippet));
    }, [snippet, open]);

    const preview = useMemo(() => {
        if (!snippet) return '';
        try {
            return snippet.build(values).text;
        } catch {
            return '';
        }
    }, [snippet, values]);

    const valid = snippet ? isSnippetValid(snippet, values) : false;

    if (!snippet) return null;

    const setField = (key: string, v: SnippetValues[string]) =>
        setValues(prev => ({ ...prev, [key]: v }));

    const handleInsert = () => {
        const { text, caretOffset } = snippet.build(values);
        onInsert(text, caretOffset);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[480px]" onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                            {snippet.label}
                        </span>
                    </DialogTitle>
                    <DialogDescription>
                        {snippet.tooltip} <span className="text-muted-foreground/80 italic">{snippet.example}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {snippet.fields.map((field) => {
                        if (field.kind === 'condition') {
                            const c = (values[field.key] as ConditionValue) || { lhs: '', op: '==', rhs: '' };
                            return (
                                <div key={field.key} className="space-y-1.5">
                                    <Label className="text-sm">{field.label}</Label>
                                    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                                        <VariableInput
                                            value={c.lhs}
                                            onChange={(lhs) => setField(field.key, { ...c, lhs })}
                                            syntaxContext="scalar"
                                            placeholder="Pick a variable (type @)"
                                            className="h-8 text-xs bg-background"
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                            <Select value={c.op} onValueChange={(op) => setField(field.key, { ...c, op })}>
                                                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {CONDITION_OPERATORS.map(op => (
                                                        <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <VariableInput
                                                value={c.rhs}
                                                onChange={(rhs) => setField(field.key, { ...c, rhs })}
                                                syntaxContext="scalar"
                                                placeholder="Value (or @ variable)"
                                                className="h-8 text-xs bg-background"
                                            />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Leave the value blank to test whether the variable simply has a value.
                                        </p>
                                    </div>
                                </div>
                            );
                        }

                        if (field.kind === 'branches') {
                            const branches = (values[field.key] as BranchValue[]) || [];
                            const ensure = (next: BranchValue[]) => setField(field.key, next.length ? next : [{ cond: { lhs: '', op: '==', rhs: '' }, body: '' }]);
                            const update = (idx: number, patch: Partial<BranchValue>) =>
                                ensure(branches.map((b, i) => i === idx ? { ...b, ...patch } : b));
                            return (
                                <div key={field.key} className="space-y-1.5">
                                    <Label className="text-sm">{field.label}</Label>
                                    <div className="space-y-3">
                                        {branches.map((b, idx) => (
                                            <div key={idx} className="space-y-2 rounded-md border bg-muted/20 p-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        {idx === 0 ? 'If' : 'Else if'}
                                                    </span>
                                                    {branches.length > 1 && (
                                                        <Button
                                                            type="button" variant="ghost" size="icon"
                                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                            onClick={() => ensure(branches.filter((_, i) => i !== idx))}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                                <VariableInput
                                                    value={b.cond.lhs}
                                                    onChange={(lhs) => update(idx, { cond: { ...b.cond, lhs } })}
                                                    syntaxContext="scalar"
                                                    placeholder="Pick a variable (type @)"
                                                    className="h-8 text-xs bg-background"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Select value={b.cond.op} onValueChange={(op) => update(idx, { cond: { ...b.cond, op } })}>
                                                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {CONDITION_OPERATORS.map(op => (
                                                                <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <VariableInput
                                                        value={b.cond.rhs}
                                                        onChange={(rhs) => update(idx, { cond: { ...b.cond, rhs } })}
                                                        syntaxContext="scalar"
                                                        placeholder="Value (or @ variable)"
                                                        className="h-8 text-xs bg-background"
                                                    />
                                                </div>
                                                <VariableInput
                                                    value={b.body}
                                                    onChange={(body) => update(idx, { body })}
                                                    syntaxContext="output"
                                                    multiline
                                                    placeholder="Show this… (type @ for variables)"
                                                    className="text-xs bg-background"
                                                />
                                            </div>
                                        ))}
                                        <Button
                                            type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                                            onClick={() => ensure([...branches, { cond: { lhs: '', op: '==', rhs: '' }, body: '' }])}
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Add branch
                                        </Button>
                                    </div>
                                </div>
                            );
                        }

                        if (field.kind === 'list') {
                            const items = (values[field.key] as string[]) || [''];
                            return (
                                <div key={field.key} className="space-y-1.5">
                                    <Label className="text-sm">{field.label}</Label>
                                    <div className="space-y-2">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <Input
                                                    value={item}
                                                    onChange={(e) => {
                                                        const next = [...items];
                                                        next[idx] = e.target.value;
                                                        setField(field.key, next);
                                                    }}
                                                    placeholder={field.placeholder || `Case ${idx + 1} value`}
                                                    className="h-8 text-xs"
                                                />
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setField(field.key, items.filter((_, i) => i !== idx).length ? items.filter((_, i) => i !== idx) : [''])}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                                            onClick={() => setField(field.key, [...items, ''])}
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Add case
                                        </Button>
                                    </div>
                                    {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                                </div>
                            );
                        }

                        if (field.kind === 'content') {
                            const val = (values[field.key] as string) ?? '';
                            return (
                                <div key={field.key} className="space-y-1.5">
                                    <Label className="text-sm">{field.label}</Label>
                                    <VariableInput
                                        value={val}
                                        onChange={(v) => setField(field.key, v)}
                                        syntaxContext="output"
                                        multiline
                                        placeholder={field.placeholder || 'Content to show (type @ for variables)'}
                                        className="text-xs"
                                    />
                                    {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                                </div>
                            );
                        }

                        // variable | text
                        const val = (values[field.key] as string) ?? '';
                        return (
                            <div key={field.key} className="space-y-1.5">
                                <Label className="text-sm">{field.label}</Label>
                                {field.kind === 'variable' ? (
                                    <VariableInput
                                        value={val}
                                        onChange={(v) => setField(field.key, v)}
                                        syntaxContext="scalar"
                                        placeholder={field.placeholder || 'Type @ for a variable'}
                                        className="h-8 text-xs"
                                    />
                                ) : (
                                    <Input
                                        value={val}
                                        onChange={(e) => setField(field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="h-8 text-xs"
                                    />
                                )}
                                {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                            </div>
                        );
                    })}
                </div>

                {/* Live preview of the generated Liquid */}
                <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</Label>
                    <pre className="text-[11px] font-mono bg-muted/40 border rounded-md p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {preview}
                    </pre>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleInsert} disabled={!valid}>Insert</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
