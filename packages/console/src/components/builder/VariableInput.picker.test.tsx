import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./hooks/useRepeaterRecordColumns', () => ({ useRepeaterRecordColumns: () => [] }));
vi.mock('@/stores/builder', () => ({ useBuilderStore: (select: (state: { currentPageId: string }) => unknown) => select({ currentPageId: 'page-1' }) }));
vi.mock('../../hooks/useVariables', () => ({ useVariables: () => ({ variables: [], filters: [{ name: 'upcase', category: 'Text' }], isLoading: false }) }));

import { VariableInput } from './VariableInput';

afterEach(cleanup);

function Field() {
    const [value, setValue] = useState('');
    return <VariableInput ariaLabel="Template text" syntaxContext="output" recordColumns={['requirements']} value={value} onChange={setValue} />;
}

it('inserts a real record field, closes on Escape, and finds a filter after whitespace', () => {
    Element.prototype.scrollIntoView ??= vi.fn();
    render(<Field />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Template text' });
    const type = (value: string) => {
        fireEvent.change(input, { target: { value } });
        input.setSelectionRange(value.length, value.length);
        fireEvent.keyUp(input, { key: value.at(-1) });
    };
    const key = (value: string) => {
        fireEvent.keyDown(input, { key: value });
        fireEvent.keyUp(input, { key: value });
    };
    type('@requ');
    expect(screen.getByText('Record')).toBeTruthy();
    key('Escape');
    expect(screen.queryByText('Record')).toBeNull();
    type('@require');
    fireEvent.click(screen.getByText('Record'));
    key('Enter');
    expect(input.value).toBe('{{ record.requirements }}');
    type('{{ record.requirements | up');
    fireEvent.click(screen.getByText('upcase'));
    expect(input.value).toBe('{{ record.requirements | upcase');
    type('person@example');
    expect(screen.queryByText('Record')).toBeNull();
});
