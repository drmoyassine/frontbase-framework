/**
 * InvalidConnectionTooltip Component Tests — Sprint 1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockState: { lastValidationError: string | null; clearRejectedConnections: ReturnType<typeof vi.fn> } = {
    lastValidationError: null,
    clearRejectedConnections: vi.fn(),
};

vi.mock('@/stores/actions', () => ({
    useActionsStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
}));

import { InvalidConnectionTooltip } from '../InvalidConnectionTooltip';

describe('InvalidConnectionTooltip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.lastValidationError = null;
    });

    afterEach(() => cleanup());

    it('renders nothing when there is no error', () => {
        render(<InvalidConnectionTooltip />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders the error message when validation fails', () => {
        mockState.lastValidationError = 'Type mismatch: source -> target';
        render(<InvalidConnectionTooltip />);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Type mismatch: source -> target')).toBeInTheDocument();
    });

    it('parses and displays structured type-mismatch details', () => {
        mockState.lastValidationError =
            'Type mismatch: SourceNode.output (array) -> TargetNode.input (number). Cannot convert array to number directly';
        render(<InvalidConnectionTooltip />);
        expect(screen.getByText(/SourceNode/)).toBeInTheDocument();
        expect(screen.getByText(/TargetNode/)).toBeInTheDocument();
        expect(screen.getByText('array')).toBeInTheDocument();
        expect(screen.getByText('number')).toBeInTheDocument();
    });

    it('shows the suggested-fix hint for a parsed mismatch', () => {
        mockState.lastValidationError =
            'Type mismatch: SourceNode.data (array) -> TargetNode.input (number). Cannot convert array to number directly';
        render(<InvalidConnectionTooltip />);
        expect(screen.getByText(/Transform node/i)).toBeInTheDocument();
    });

    it('calls clearRejectedConnections when dismissed', () => {
        mockState.lastValidationError = 'Test error';
        render(<InvalidConnectionTooltip />);
        screen.getByText('Dismiss').click();
        expect(mockState.clearRejectedConnections).toHaveBeenCalled();
    });
});
