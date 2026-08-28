/**
 * Variables service — first service migrated onto the GENERATED client
 * (CF-22 P0 / W2 exemplar). Public function signatures are unchanged, so
 * consumers are untouched; only the transport moved from the legacy axios
 * instance to the generated SDK (src/client, configured in lib/api-client).
 *
 * Note: the backend's variables routes are still untyped in the contract
 * (see fastapi-backend/contracts/openapi_gaps.json), so responses are cast to
 * the existing AppVariable type. When response_model lands on those routes,
 * the casts disappear and the generated types take over end-to-end.
 */
import {
    variablesGetVariables,
    variablesCreateVariableEndpoint,
    variablesUpdateVariableEndpoint,
    variablesDeleteVariable,
} from '@/client';
import { AppVariable } from '@/types/builder';

export const getVariables = async (): Promise<AppVariable[]> => {
    const { data } = await variablesGetVariables({ throwOnError: true });
    return data as AppVariable[];
};

export const createVariable = async (
    variableData: Omit<AppVariable, 'id' | 'createdAt'>,
): Promise<AppVariable> => {
    const { data } = await variablesCreateVariableEndpoint({
        body: variableData,
        throwOnError: true,
    });
    return data as AppVariable;
};

export const updateVariable = async (
    variableId: string,
    variableData: Partial<AppVariable>,
): Promise<AppVariable> => {
    const { data } = await variablesUpdateVariableEndpoint({
        path: { variable_id: variableId },
        body: variableData,
        throwOnError: true,
    });
    return data as AppVariable;
};

export const deleteVariable = async (variableId: string): Promise<void> => {
    await variablesDeleteVariable({
        path: { variable_id: variableId },
        throwOnError: true,
    });
};
