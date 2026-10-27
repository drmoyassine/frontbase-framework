import { useState, useEffect, useCallback } from 'react';
import { AuthForm } from '@/types/auth-form';
import { useToast } from '@/hooks/use-toast';

export function useAuthForms() {
    const [forms, setForms] = useState<AuthForm[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchForms = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth-forms/');
            const json = await res.json();
            if (json.success) {
                setForms(json.data);
            } else {
                throw new Error(json.error);
            }
        } catch (err: any) {
            console.error('Failed to fetch auth forms:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createForm = async (data: Partial<AuthForm>) => {
        try {
            const res = await fetch('/api/auth-forms/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (json.success) {
                setForms(prev => [json.data, ...prev]);
                toast({ title: 'Form Created', description: 'Authentication form created.' });
                return json.data;
            } else {
                throw new Error(json.error);
            }
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
            throw err;
        }
    };

    const updateForm = async (id: string, data: Partial<AuthForm>) => {
        try {
            const res = await fetch(`/api/auth-forms/${id}/`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (json.success) {
                setForms(prev => prev.map(f => f.id === id ? json.data : f));
                toast({ title: 'Form Updated', description: 'Changes saved successfully.' });
                return json.data;
            } else {
                throw new Error(json.error);
            }
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
            throw err;
        }
    };

    const deleteForm = async (id: string) => {
        try {
            const res = await fetch(`/api/auth-forms/${id}/`, {
                method: 'DELETE'
            });
            const json = await res.json();
            if (json.success) {
                setForms(prev => prev.filter(f => f.id !== id));
                toast({ title: 'Form Deleted', description: 'Authentication form removed.' });
            } else {
                throw new Error(json.error);
            }
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
            throw err;
        }
    };

    const setPrimary = async (id: string) => {
        try {
            const res = await fetch(`/api/auth-forms/${id}/set-primary/`, {
                method: 'PUT'
            });
            const json = await res.json();
            if (json.success) {
                // Refresh to get updated isPrimary flags on all forms
                await fetchForms();
                toast({ title: 'Primary Form Set', description: 'This form will be used for private page authentication.' });
            } else {
                throw new Error(json.error);
            }
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    };

    useEffect(() => {
        fetchForms();
    }, [fetchForms]);

    return {
        forms,
        loading,
        error,
        createForm,
        updateForm,
        deleteForm,
        setPrimary,
        refresh: fetchForms
    };
}
