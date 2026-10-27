import { StateCreator } from 'zustand';
import { AppVariable } from '@/types/builder';
import { BuilderState } from '../builder';
import { toast } from '@/hooks/use-toast';
import { getVariables as getVariablesApi, createVariable as createVariableApi, updateVariable as updateVariableApi, deleteVariable as deleteVariableApi } from '../../services/variables-api';

export interface VariablesSlice {
    appVariables: AppVariable[];
    isVariablesLoading: boolean;
    error: string | null;
    addAppVariable: (variable: Omit<AppVariable, 'id' | 'createdAt'>) => void;
    updateAppVariable: (id: string, updates: Partial<AppVariable>) => void;
    deleteAppVariable: (id: string) => void;
    loadVariablesFromDatabase: () => Promise<void>;
}

export const createVariablesSlice: StateCreator<BuilderState, [], [], VariablesSlice> = (set, get) => ({
    appVariables: [],
    isVariablesLoading: false,
    error: null,

    loadVariablesFromDatabase: async () => {
        set({ isVariablesLoading: true, error: null });
        try {
            const variables = await getVariablesApi();
            set({ appVariables: variables, isVariablesLoading: false });
        } catch (error: any) {
            set({
                error: error.response?.data?.message || 'Failed to fetch variables',
                isVariablesLoading: false,
            });
        }
    },

    addAppVariable: async (variableData) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const newVariable = await createVariableApi(variableData);
            set((state) => ({
                appVariables: [...state.appVariables, newVariable]
            }));
            toast({
                title: "Variable created",
                description: "App variable has been created successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error creating variable",
                description: error.response?.data?.message || error.message || "Failed to create variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    updateAppVariable: async (id, updates) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            const updatedVariable = await updateVariableApi(id, updates);
            set((state) => ({
                appVariables: state.appVariables.map(variable =>
                    variable.id === id ? updatedVariable : variable
                )
            }));
            toast({
                title: "Variable updated",
                description: "App variable has been updated successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error updating variable",
                description: error.response?.data?.message || error.message || "Failed to update variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },

    deleteAppVariable: async (id) => {
        const { setSaving } = get();
        setSaving(true);
        try {
            await deleteVariableApi(id);
            set((state) => ({
                appVariables: state.appVariables.filter(variable => variable.id !== id)
            }));
            toast({
                title: "Variable deleted",
                description: "App variable has been deleted successfully"
            });
        } catch (error: any) {
            toast({
                title: "Error deleting variable",
                description: error.response?.data?.message || error.message || "Failed to delete variable",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    },
});
