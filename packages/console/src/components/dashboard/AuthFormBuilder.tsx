import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthForm, AUTH_PROVIDERS } from '@/types/auth-form';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { ExternalLink, HelpCircle, Mail, Globe } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface AuthFormBuilderProps {
    form: AuthForm | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (form: Partial<AuthForm>) => Promise<void>;
    params?: {
        contactTypes?: Record<string, string>;
    }
}

export function AuthFormBuilder({ form, open, onOpenChange, onSave }: AuthFormBuilderProps) {
    const { config } = useUserContactConfig();
    const contactTypes = config?.contactTypes || {};

    const [formData, setFormData] = useState<Partial<AuthForm>>({
        name: '',
        type: 'login',
        config: {
            title: 'Welcome Back',
            providers: [],
            socialLayout: 'horizontal',
            showLinks: true
        },
        allowedContactTypes: [],
        targetContactType: '', // Fallback/Legacy
        isActive: true
    });

    useEffect(() => {
        if (form) {
            setFormData(form);
        } else {
            // Default select the first contact type if available
            const firstType = Object.keys(contactTypes)[0];
            setFormData({
                name: '',
                type: 'login',
                config: { title: 'Welcome Back', providers: [], socialLayout: 'horizontal', showLinks: true },
                allowedContactTypes: firstType ? [firstType] : [],
                targetContactType: firstType || '',
                isActive: true
            });
        }
    }, [form, open, contactTypes]);

    const updateConfig = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            config: { ...prev.config, [key]: value }
        }));
    };

    const toggleProvider = (providerId: string) => {
        const current = formData.config?.providers || [];
        const newProviders = current.includes(providerId)
            ? current.filter(p => p !== providerId)
            : [...current, providerId];
        updateConfig('providers', newProviders);
    };

    const toggleContactType = (typeKey: string) => {
        const current = formData.allowedContactTypes || [];
        // If legacy targetContactType is set but allowed is empty, sync them first
        let base = current;
        if (base.length === 0 && formData.targetContactType) {
            base = [formData.targetContactType];
        }

        const newTypes = base.includes(typeKey)
            ? base.filter(t => t !== typeKey)
            : [...base, typeKey];

        setFormData(prev => ({
            ...prev,
            allowedContactTypes: newTypes,
            // Keep targetContactType as the first one for backwards compat logic
            targetContactType: newTypes.length > 0 ? newTypes[0] : ''
        }));
    };

    const handleSave = async () => {
        // Ensure legacy field is populated for safety
        const finalData = { ...formData };
        if (finalData.allowedContactTypes && finalData.allowedContactTypes.length > 0) {
            finalData.targetContactType = finalData.allowedContactTypes[0];
        }
        await onSave(finalData);
        onOpenChange(false);
    };

    const isSignup = formData.type === 'signup' || formData.type === 'both';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{form ? 'Edit Form' : 'Create Authentication Form'}</DialogTitle>
                    <DialogDescription>
                        Configure your {formData.type} form appearance and behavior.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6 py-4">
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Form Name</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Customer Portal"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Form Type</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(val: 'login' | 'signup' | 'both') => setFormData(prev => ({
                                        ...prev,
                                        type: val,
                                        config: {
                                            ...prev.config,
                                            title: val === 'login' ? 'Welcome Back' : (val === 'signup' ? 'Create an Account' : 'Welcome')
                                        }
                                    }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="login">Login Only</SelectItem>
                                        <SelectItem value="signup">Sign Up Only</SelectItem>
                                        <SelectItem value="both">Both (Tabs)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {isSignup && (
                            <div className="space-y-3 p-4 bg-slate-50 border rounded-md">
                                <div>
                                    <Label>Allowed Contact Types</Label>
                                    <DialogDescription className="text-xs mb-3">
                                        Users signing up will be assigned these types. If multiple are selected, the user will choose from a dropdown.
                                    </DialogDescription>
                                </div>

                                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                    {Object.entries(contactTypes).map(([key, label]) => (
                                        <div key={key} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`ct-${key}`}
                                                checked={formData.allowedContactTypes?.includes(key) || formData.targetContactType === key}
                                                onCheckedChange={() => toggleContactType(key)}
                                            />
                                            <Label htmlFor={`ct-${key}`} className="text-sm font-normal">
                                                {label} <span className="text-xs text-muted-foreground">({key})</span>
                                            </Label>
                                        </div>
                                    ))}
                                </div>

                                {Object.keys(contactTypes).length === 0 && (
                                    <div className="text-amber-600 text-xs">No contact types defined. Go to User Configuration to add them.</div>
                                )}
                            </div>
                        )}

                        <Tabs defaultValue="appearance">
                            <TabsList className="w-full">
                                <TabsTrigger value="appearance" className="flex-1">Appearance</TabsTrigger>
                                <TabsTrigger value="social" className="flex-1">Social Providers</TabsTrigger>
                                <TabsTrigger value="advanced" className="flex-1">Advanced</TabsTrigger>
                                <TabsTrigger value="help" className="flex-1">Help</TabsTrigger>
                            </TabsList>

                            <TabsContent value="appearance" className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Heading Title</Label>
                                    <Input
                                        value={formData.config?.title}
                                        onChange={e => updateConfig('title', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Logo URL</Label>
                                    <Input
                                        value={formData.config?.logoUrl || ''}
                                        onChange={e => updateConfig('logoUrl', e.target.value)}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Primary Color</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="color"
                                            className="w-12 p-1 h-9"
                                            value={formData.config?.primaryColor || '#000000'}
                                            onChange={e => updateConfig('primaryColor', e.target.value)}
                                        />
                                        <Input
                                            value={formData.config?.primaryColor || '#000000'}
                                            onChange={e => updateConfig('primaryColor', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="social" className="space-y-4 pt-4">
                                <div className="rounded-md border p-4">
                                    <h4 className="font-medium mb-4 flex items-center gap-2">
                                        Enable Providers
                                        <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-slate-100">
                                            Display Buttons Only
                                        </span>
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {AUTH_PROVIDERS.map(provider => (
                                            <div key={provider.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`p-${provider.id}`}
                                                    checked={formData.config?.providers?.includes(provider.id)}
                                                    onCheckedChange={() => toggleProvider(provider.id)}
                                                />
                                                <Label htmlFor={`p-${provider.id}`} className="cursor-pointer">{provider.name}</Label>
                                            </div>
                                        ))}
                                    </div>

                                    <Alert>
                                        <AlertTitle className="text-sm font-medium">Important Configuration</AlertTitle>
                                        <AlertDescription className="text-xs text-muted-foreground mt-1">
                                            Buttons will only work if the provider is configured in Supabase.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            </TabsContent>

                            <TabsContent value="advanced" className="space-y-4 pt-4">
                                <div className="space-y-4 rounded-md border p-4">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="magic-link"
                                            checked={formData.config?.magicLink}
                                            onCheckedChange={(checked) => updateConfig('magicLink', checked)}
                                        />
                                        <div className="grid gap-1.5 leading-none">
                                            <Label htmlFor="magic-link" className="font-medium">Enable Magic Link</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Allow users to sign in with an email link (passwordless).
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 rounded-md border p-4">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="is-embeddable"
                                            checked={formData.config?.is_embeddable}
                                            onCheckedChange={(checked) => updateConfig('is_embeddable', checked)}
                                        />
                                        <div className="grid gap-1.5 leading-none">
                                            <Label htmlFor="is-embeddable" className="font-medium">Embeddable on External Sites</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Allow this form to be embedded on external websites via a script tag.
                                                When enabled, the form config is synced to your edge engine.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label>Redirect URL (Override)</Label>
                                    <Input
                                        value={formData.redirectUrl || ''}
                                        onChange={e => setFormData(prev => ({ ...prev, redirectUrl: e.target.value }))}
                                        placeholder="Default: determined by User Contact Type"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Enter a full URL (e.g., https://google.com) to force a redirection after login/signup.
                                    </p>
                                </div>
                            </TabsContent>

                            <TabsContent value="help" className="pt-4 space-y-4">
                                <div className="grid gap-4">
                                    <a href="https://supabase.com/dashboard/project/_/auth/providers" target="_blank" rel="noopener noreferrer"
                                        className="flex items-start p-3 border rounded-lg hover:bg-slate-50 transition-colors group">
                                        <ExternalLink className="h-5 w-5 mr-3 text-blue-600 mt-0.5" />
                                        <div>
                                            <div className="font-medium group-hover:text-blue-700">Configure Social Providers</div>
                                            <div className="text-sm text-muted-foreground">Supabase Dashboard - Enable Google, GitHub, etc.</div>
                                        </div>
                                    </a>

                                    <a href="https://supabase.com/dashboard/project/_/auth/templates" target="_blank" rel="noopener noreferrer"
                                        className="flex items-start p-3 border rounded-lg hover:bg-slate-50 transition-colors group">
                                        <Mail className="h-5 w-5 mr-3 text-purple-600 mt-0.5" />
                                        <div>
                                            <div className="font-medium group-hover:text-purple-700">Email Templates</div>
                                            <div className="text-sm text-muted-foreground">Customize Confirmation & Reset Password emails.</div>
                                        </div>
                                    </a>

                                    <a href="https://supabase.com/dashboard/project/_/auth/url-configuration" target="_blank" rel="noopener noreferrer"
                                        className="flex items-start p-3 border rounded-lg hover:bg-slate-50 transition-colors group">
                                        <Globe className="h-5 w-5 mr-3 text-green-600 mt-0.5" />
                                        <div>
                                            <div className="font-medium group-hover:text-green-700">Redirect URLs</div>
                                            <div className="text-sm text-muted-foreground">Add your production domains here (e.g. easypanel.host) to allow redirects.</div>
                                        </div>
                                    </a>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-4 border-t items-center justify-between">
                    <div className="flex flex-col gap-1 text-xs text-destructive">
                        {!formData.name && <span>* Form name is required</span>}
                        {isSignup && (!formData.allowedContactTypes || formData.allowedContactTypes.length === 0) && (
                            <span>* At least one contact type is required</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button
                            onClick={handleSave}
                            disabled={
                                !formData.name?.trim() ||
                                (isSignup && (!formData.allowedContactTypes || formData.allowedContactTypes.length === 0))
                            }
                        >
                            {form ? 'Save Changes' : 'Create Form'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
