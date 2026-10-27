/**
 * useActionTrigger - Hook for executing workflow actions
 * 
 * Used by components to trigger workflow execution when events occur.
 */

import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ActionBinding } from '@/components/actions';

interface TriggerContext {
    componentId: string;
    componentType: string;
    rowData?: Record<string, any>;
    formValues?: Record<string, any>;
    event?: React.SyntheticEvent;
}

const ACTIONS_ENGINE_URL = '/actions';

export function useActionTrigger(bindings: ActionBinding[] = []) {
    const { toast } = useToast();

    const triggerAction = useCallback(async (
        trigger: ActionBinding['trigger'],
        context: TriggerContext
    ) => {
        // Find matching bindings for this trigger
        const matchingBindings = bindings.filter(b => b.trigger === trigger && b.workflowId);

        if (matchingBindings.length === 0) return;

        for (const binding of matchingBindings) {
            try {
                // Build parameters from mappings
                const parameters: Record<string, any> = {};

                for (const [key, mapping] of Object.entries(binding.parameterMappings || {})) {
                    switch (mapping.source) {
                        case 'static':
                            parameters[key] = mapping.value;
                            break;
                        case 'rowData':
                            parameters[key] = mapping.path
                                ? context.rowData?.[mapping.path]
                                : context.rowData;
                            break;
                        case 'formValues':
                            parameters[key] = mapping.path
                                ? context.formValues?.[mapping.path]
                                : context.formValues;
                            break;
                        case 'componentProp':
                            // TODO: Get component prop value
                            break;
                        case 'urlParams':
                            parameters[key] = new URLSearchParams(window.location.search).get(mapping.path || '');
                            break;
                    }
                }

                // Add context data as default parameters
                if (context.rowData) parameters._rowData = context.rowData;
                if (context.formValues) parameters._formValues = context.formValues;

                // Execute workflow via Actions Engine
                const response = await fetch(`${ACTIONS_ENGINE_URL}/execute/${binding.workflowId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parameters }),
                });

                if (!response.ok) {
                    throw new Error('Workflow execution failed');
                }

                const result = await response.json();

                // Handle success action
                if (binding.onSuccess) {
                    switch (binding.onSuccess.type) {
                        case 'toast':
                            toast({
                                title: 'Success',
                                description: binding.onSuccess.message || 'Action completed',
                            });
                            break;
                        case 'redirect':
                            if (binding.onSuccess.url) {
                                window.location.href = binding.onSuccess.url;
                            }
                            break;
                        case 'refresh':
                            window.location.reload();
                            break;
                    }
                }

                return result;

            } catch (error: any) {
                console.error('Action trigger error:', error);

                // Handle error action
                if (binding.onError) {
                    toast({
                        title: 'Error',
                        description: binding.onError.message || error.message,
                        variant: 'destructive',
                    });
                }

                throw error;
            }
        }
    }, [bindings, toast]);

    // Convenience methods for common triggers
    const onClick = useCallback((context: Omit<TriggerContext, 'event'> & { event?: React.MouseEvent }) => {
        return triggerAction('onClick', context);
    }, [triggerAction]);

    const onSubmit = useCallback((context: Omit<TriggerContext, 'event'> & { event?: React.FormEvent }) => {
        return triggerAction('onSubmit', context);
    }, [triggerAction]);

    const onRowClick = useCallback((context: TriggerContext) => {
        return triggerAction('onRowClick', context);
    }, [triggerAction]);

    const onLoad = useCallback((context: TriggerContext) => {
        return triggerAction('onLoad', context);
    }, [triggerAction]);

    const onChange = useCallback((context: TriggerContext) => {
        return triggerAction('onChange', context);
    }, [triggerAction]);

    return {
        triggerAction,
        onClick,
        onSubmit,
        onRowClick,
        onLoad,
        onChange,
        hasBinding: (trigger: ActionBinding['trigger']) =>
            bindings.some(b => b.trigger === trigger && b.workflowId),
    };
}
