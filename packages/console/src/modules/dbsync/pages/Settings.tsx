/**
 * DBSync Module Settings Page
 * 
 * Settings page for the dbsync module with tabs for Cache and Privacy settings.
 * Uses shared form components for consistency with Dashboard settings.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Shield, Settings as SettingsIcon } from 'lucide-react';
import { RedisSettingsForm } from '@/components/dashboard/settings/shared/RedisSettingsForm';
import { PrivacySettingsForm } from '@/components/dashboard/settings/shared/PrivacySettingsForm';

export default function Settings() {
    const [activeTab, setActiveTab] = React.useState<'general' | 'privacy'>('general');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Configure your project settings and integrations
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b mb-6">
                <button
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'general'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    onClick={() => setActiveTab('general')}
                >
                    <SettingsIcon size={16} />
                    General
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${activeTab === 'privacy'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    onClick={() => setActiveTab('privacy')}
                >
                    <Shield size={16} />
                    Privacy & Tracking
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'general' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database size={20} />
                            Redis Cache Configuration
                        </CardTitle>
                        <CardDescription>
                            Configure Redis caching to improve data loading performance.
                            When enabled, API responses will be cached to reduce load times.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <RedisSettingsForm />
                    </CardContent>
                </Card>
            )}

            {activeTab === 'privacy' && (
                <PrivacySettingsForm withCard />
            )}
        </div>
    );
}
