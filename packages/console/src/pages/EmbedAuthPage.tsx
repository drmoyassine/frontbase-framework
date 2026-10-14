import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAppUserClient,syncAppUserSession,safeAppRedirect} from './app-user-session';
import { AuthForm, AUTH_PROVIDERS } from '@/types/auth-form';
import { Loader2 } from 'lucide-react';
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
    const [supabase,setSupabase]=useState<SupabaseClient|null>(null);
    const [contactLabels,setContactLabels]=useState<Record<string,string>>({});

    useEffect(() => {
        let active=true;const controller=new AbortController();let client:SupabaseClient|null=null;
        setLoading(true);setError(null);setForm(null);setSupabase(null);setContactLabels({});setSelectedContactType('');setActiveTab('sign_in');
        async function fetchForm() {
            try {
                const res = await fetch(`/api/app-users/forms/${formId}/`,{credentials:'omit',signal:controller.signal});
                const json = await res.json();if(!active)return;
                if (res.ok&&json.form&&json.provider) {
                    const loadedForm = json.form;
                    client=createAppUserClient(json.provider);setSupabase(client);
                    setContactLabels(json.contactTypes??{});
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
                    setError('Form unavailable. Check its activation and App Users configuration.');
                }
            } catch (err) {
                if(active)setError('Failed to load form');
            } finally {
                if(active)setLoading(false);
            }
        }

        if (formId) {
            fetchForm();
        }else setLoading(false);
        return()=>{active=false;controller.abort();void client?.auth.stopAutoRefresh();};
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
        if(!supabase||!form)return;let active=true;
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'SIGNED_IN'||event==='INITIAL_SESSION') && session && form) {
                // Only the server bridge establishes the application cookie.
                try{await syncAppUserSession(session.access_token);if(!active)return;window.top!.location.href=new URL(safeAppRedirect(form.redirectUrl),window.location.origin).href;}catch(e){if(active)setError(e instanceof Error?e.message:'Login could not be confirmed');}
            }
            if(event==='TOKEN_REFRESHED'||event==='SIGNED_OUT'){
                // Defer fetch work outside the SDK's auth-state notification lock.
                void Promise.resolve().then(()=>{if(active)return syncAppUserSession(session?.access_token??null);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Login could not be confirmed');});
            }
        });

        return () => {active=false;subscription.unsubscribe();};
    }, [form,supabase]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !form || !supabase) {
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
                                    {contactLabels[type] || type}
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
                redirectTo={window.location.origin + window.location.pathname}
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
