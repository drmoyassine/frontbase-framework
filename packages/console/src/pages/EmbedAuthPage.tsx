import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabase';
import { AuthForm, AUTH_PROVIDERS } from '@/types/auth-form';
import { Loader2 } from 'lucide-react';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function EmbedAuthPage() {
    const { formId } = useParams<{ formId: string }>();
    const [form, setForm] = useState<AuthForm | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedContactType, setSelectedContactType] = useState<string>('');
    const [activeTab, setActiveTab] = useState('sign_in');

    // Use config to determine redirection logic
    const { config: userConfig } = useUserContactConfig();

    useEffect(() => {
        async function fetchForm() {
            try {
                const res = await fetch(`/api/auth-forms/${formId}/`);
                const json = await res.json();
                if (json.success) {
                    const loadedForm = json.data;
                    setForm(loadedForm);
                    // Initialize contact type
                    if (loadedForm.allowedContactTypes && loadedForm.allowedContactTypes.length > 0) {
                        setSelectedContactType(loadedForm.allowedContactTypes[0]);
                    } else if (loadedForm.targetContactType) {
                        setSelectedContactType(loadedForm.targetContactType);
                    }
                    // Initialize active tab
                    if (loadedForm.type === 'signup') setActiveTab('sign_up');
                    else if (loadedForm.type === 'login') setActiveTab('sign_in');
                    else if (loadedForm.config.defaultView) setActiveTab(loadedForm.config.defaultView);
                } else {
                    setError(json.error || 'Form not found');
                }
            } catch (err) {
                setError('Failed to load form');
            } finally {
                setLoading(false);
            }
        }

        if (formId) {
            fetchForm();
        }
    }, [formId]);

    // Resize Observer for Smart Embed
    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.contentRect.height;
                // Post message to parent
                window.parent.postMessage({
                    type: 'frontbase-resize',
                    formId,
                    height: height + 20 // Add a little padding
                }, '*');
            }
        });

        const container = document.getElementById('auth-container');
        if (container) {
            observer.observe(container);
        }

        return () => observer.disconnect();
    }, [formId, form, activeTab, selectedContactType]); // Re-measure on tab switch or selection change

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && form) {
                // If this was a SIGNUP event, we might need to record the contact type
                // Note: Getting the exact event type (signup vs login) can be tricky in Supabase v2 client-side
                // But we can check if the user has metadata or if we want to force an update.

                // Ideally, we'd pass this as metadata to the signUp call, 
                // but Auth UI component doesn't easily allow dynamic metadata injection based on external state *during* the submission.
                // WORKAROUND: We will update the user's metadata immediately after sign in if it's not set.
                // However, since we are in an iframe, security rules might apply.

                // Ideally the redirect URL handles the semantic logic. 
                // For now, let's assume the user is created and we handle navigation.

                // Handle Redirection logic
                if (form.redirectUrl) {
                    window.top!.location.href = form.redirectUrl;
                    return;
                }

                // Default logic: Redirect to dashboard
                const builderUrl = window.location.origin;
                window.top!.location.href = `${builderUrl}/dashboard`;
            }
        });

        return () => subscription.unsubscribe();
    }, [form]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !form) {
        return (
            <div className="flex items-center justify-center min-h-[300px] text-destructive">
                <p>{error || 'Form not found'}</p>
            </div>
        );
    }

    const enabledProviders = form.config.providers || [];
    const showSocial = enabledProviders.length > 0;
    const contactTypes = form.allowedContactTypes || (form.targetContactType ? [form.targetContactType] : []);
    const showContactTypeSelector = activeTab === 'sign_up' && contactTypes.length > 1;

    // Supabase Auth Appearance Config
    const appearance = {
        theme: ThemeSupa,
        variables: {
            default: {
                colors: {
                    brand: form.config.primaryColor || '#000000',
                    brandAccent: form.config.primaryColor || '#000000',
                },
            },
        },
        className: {
            container: 'w-full',
            button: 'w-full',
            input: 'w-full',
        }
    };

    const renderAuth = (view: 'sign_in' | 'sign_up') => (
        <div className="space-y-4">
            {view === 'sign_up' && showContactTypeSelector && (
                <div className="space-y-1.5 fade-in">
                    <Label className="text-sm text-muted-foreground ml-1">I am a...</Label>
                    <Select value={selectedContactType} onValueChange={setSelectedContactType}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            {contactTypes.map(type => (
                                <SelectItem key={type} value={type}>
                                    {userConfig?.contactTypes[type] || type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <Auth
                supabaseClient={supabase}
                view={view}
                appearance={appearance}
                providers={enabledProviders as any}
                socialLayout={form.config.socialLayout || 'horizontal'}
                showLinks={form.config.showLinks !== false}
                magicLink={form.config.magicLink}
                onlyThirdPartyProviders={false}
                redirectTo={window.location.origin + '/auth/callback'}
                // Pass metadata to be saved on signup
                additionalData={
                    view === 'sign_up' && selectedContactType
                        ? { contact_type: selectedContactType }
                        : undefined
                }
            />
        </div>
    );

    return (
        <div id="auth-container" className="w-full max-w-md mx-auto p-4 bg-background">
            {form.config.logoUrl && (
                <div className="flex justify-center mb-6">
                    <img src={form.config.logoUrl} alt="Logo" className="h-12 object-contain" />
                </div>
            )}

            {form.config.title && (
                <h1 className="text-xl font-semibold text-center mb-6">{form.config.title}</h1>
            )}

            {form.type === 'both' ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                        <TabsTrigger value="sign_in">Sign In</TabsTrigger>
                        <TabsTrigger value="sign_up">Sign Up</TabsTrigger>
                    </TabsList>
                    <TabsContent value="sign_in">
                        {renderAuth('sign_in')}
                    </TabsContent>
                    <TabsContent value="sign_up">
                        {renderAuth('sign_up')}
                    </TabsContent>
                </Tabs>
            ) : (
                renderAuth(form.type === 'login' ? 'sign_in' : 'sign_up')
            )}
        </div>
    );
}
