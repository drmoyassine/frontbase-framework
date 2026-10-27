/**
 * usePrivacySettings Hook
 * 
 * Centralized state management for Privacy & Tracking configuration.
 * Used by both Dashboard SettingsPanel and dbsync Module Settings.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, PrivacySettings, AdvancedVariables, CookieVariables } from '@/modules/dbsync/api';
import { STALE } from '@/lib/queryCache';

// Default values for advanced variables
const DEFAULT_ADVANCED_VARIABLES: AdvancedVariables = {
    ip: { collect: false, expose: false },
    browser: { collect: true, expose: true },
    os: { collect: true, expose: true },
    language: { collect: true, expose: true },
    viewport: { collect: true, expose: true },
    themePreference: { collect: true, expose: true },
    connectionType: { collect: true, expose: false },
    referrer: { collect: true, expose: true },
    isBot: { collect: true, expose: true },
};

// Default values for cookie variables
const DEFAULT_COOKIE_VARIABLES: CookieVariables = {
    isFirstVisit: { collect: true, expose: true },
    visitCount: { collect: true, expose: true },
    firstVisitAt: { collect: true, expose: true },
    landingPage: { collect: true, expose: true },
};

export interface UsePrivacySettingsReturn {
    // State
    enableVisitorTracking: boolean;
    cookieExpiryDays: number;
    requireCookieConsent: boolean;
    advancedVariables: AdvancedVariables;
    cookieVariables: CookieVariables;
    ga4MeasurementId: string;
    gtmContainerId: string;
    customHeadHtml: string;

    // Setters
    setEnableVisitorTracking: (enabled: boolean) => void;
    setCookieExpiryDays: (days: number) => void;
    setRequireCookieConsent: (required: boolean) => void;
    setGa4MeasurementId: (id: string) => void;
    setGtmContainerId: (id: string) => void;
    setCustomHeadHtml: (html: string) => void;
    setAdvancedVariables: React.Dispatch<React.SetStateAction<AdvancedVariables>>;
    setCookieVariables: React.Dispatch<React.SetStateAction<CookieVariables>>;

    // Status
    isLoading: boolean;
    hasChanges: boolean;

    // Actions
    handleChange: () => void;
    handleAdvancedChange: (key: keyof AdvancedVariables, field: 'collect' | 'expose', value: boolean) => void;
    handleCookieChange: (key: keyof CookieVariables, field: 'collect' | 'expose', value: boolean) => void;
    save: () => void;

    // Mutation states
    isSaving: boolean;
    saveSuccess: boolean;
}

export function usePrivacySettings(): UsePrivacySettingsReturn {
    const queryClient = useQueryClient();

    // State
    const [enableVisitorTracking, setEnableVisitorTracking] = useState(false);
    const [cookieExpiryDays, setCookieExpiryDays] = useState(365);
    const [requireCookieConsent, setRequireCookieConsent] = useState(true);
    const [advancedVariables, setAdvancedVariables] = useState<AdvancedVariables>(DEFAULT_ADVANCED_VARIABLES);
    const [cookieVariables, setCookieVariables] = useState<CookieVariables>(DEFAULT_COOKIE_VARIABLES);
    // Sprint 4A: builder analytics
    const [ga4MeasurementId, setGa4MeasurementId] = useState('');
    const [gtmContainerId, setGtmContainerId] = useState('');
    const [customHeadHtml, setCustomHeadHtml] = useState('');
    const [hasChanges, setHasChanges] = useState(false);

    // Query
    const { data: settings, isLoading } = useQuery({
        queryKey: ['privacySettings'],
        queryFn: () => settingsApi.getPrivacy().then(r => r.data),
        staleTime: STALE.STANDARD,
    });

    // Sync state from server
    useEffect(() => {
        if (settings) {
            setEnableVisitorTracking(settings.enableVisitorTracking);
            setCookieExpiryDays(settings.cookieExpiryDays);
            setRequireCookieConsent(settings.requireCookieConsent);
            // Sprint 4A: builder analytics
            setGa4MeasurementId(settings.ga4MeasurementId || '');
            setGtmContainerId(settings.gtmContainerId || '');
            setCustomHeadHtml(settings.customHeadHtml || '');

            // Handle migration from old settings structure - merge with defaults
            if (settings.advancedVariables) {
                setAdvancedVariables({
                    ip: settings.advancedVariables.ip ?? DEFAULT_ADVANCED_VARIABLES.ip,
                    browser: settings.advancedVariables.browser ?? DEFAULT_ADVANCED_VARIABLES.browser,
                    os: settings.advancedVariables.os ?? DEFAULT_ADVANCED_VARIABLES.os,
                    language: settings.advancedVariables.language ?? DEFAULT_ADVANCED_VARIABLES.language,
                    viewport: settings.advancedVariables.viewport ?? DEFAULT_ADVANCED_VARIABLES.viewport,
                    themePreference: settings.advancedVariables.themePreference ?? DEFAULT_ADVANCED_VARIABLES.themePreference,
                    connectionType: settings.advancedVariables.connectionType ?? DEFAULT_ADVANCED_VARIABLES.connectionType,
                    referrer: settings.advancedVariables.referrer ?? DEFAULT_ADVANCED_VARIABLES.referrer,
                    isBot: settings.advancedVariables.isBot ?? DEFAULT_ADVANCED_VARIABLES.isBot,
                });
            }

            if (settings.cookieVariables) {
                setCookieVariables({
                    isFirstVisit: settings.cookieVariables.isFirstVisit ?? DEFAULT_COOKIE_VARIABLES.isFirstVisit,
                    visitCount: settings.cookieVariables.visitCount ?? DEFAULT_COOKIE_VARIABLES.visitCount,
                    firstVisitAt: settings.cookieVariables.firstVisitAt ?? DEFAULT_COOKIE_VARIABLES.firstVisitAt,
                    landingPage: settings.cookieVariables.landingPage ?? DEFAULT_COOKIE_VARIABLES.landingPage,
                });
            }
        }
    }, [settings]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (data: PrivacySettings) => settingsApi.updatePrivacy(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['privacySettings'] });
            setHasChanges(false);
        },
    });

    // Handlers
    const handleChange = () => {
        setHasChanges(true);
    };

    const handleAdvancedChange = (key: keyof AdvancedVariables, field: 'collect' | 'expose', value: boolean) => {
        setAdvancedVariables(prev => {
            const newValue = { ...prev[key], [field]: value };
            // If turning off collect, also turn off expose
            if (field === 'collect' && !value) {
                newValue.expose = false;
            }
            return { ...prev, [key]: newValue };
        });
        setHasChanges(true);
    };

    const handleCookieChange = (key: keyof CookieVariables, field: 'collect' | 'expose', value: boolean) => {
        setCookieVariables(prev => {
            const newValue = { ...prev[key], [field]: value };
            // If turning off collect, also turn off expose
            if (field === 'collect' && !value) {
                newValue.expose = false;
            }
            return { ...prev, [key]: newValue };
        });
        setHasChanges(true);
    };

    const save = () => {
        saveMutation.mutate({
            enableVisitorTracking,
            cookieExpiryDays,
            requireCookieConsent,
            cookieVariables,
            advancedVariables,
            ga4MeasurementId,
            gtmContainerId,
            customHeadHtml,
        });
    };

    return {
        // State
        enableVisitorTracking,
        cookieExpiryDays,
        requireCookieConsent,
        advancedVariables,
        cookieVariables,
        ga4MeasurementId,
        gtmContainerId,
        customHeadHtml,

        // Setters
        setEnableVisitorTracking,
        setCookieExpiryDays,
        setRequireCookieConsent,
        setAdvancedVariables,
        setCookieVariables,
        setGa4MeasurementId,
        setGtmContainerId,
        setCustomHeadHtml,

        // Status
        isLoading,
        hasChanges,

        // Actions
        handleChange,
        handleAdvancedChange,
        handleCookieChange,
        save,

        // Mutation states
        isSaving: saveMutation.isPending,
        saveSuccess: saveMutation.isSuccess && !hasChanges,
    };
}
