import { useState, useEffect } from 'react';
import { useCurrentUserData } from './useCurrentUserData';
import { useAuthStore } from '@/stores/auth';

export interface UserProfile {
  id: string;
  authUserId: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  [key: string]: any; // Allow additional custom fields
}

/**
 * Hook for frontend applications to access current user's profile data
 * This syncs the authenticated user with their contact information
 */
export function useUserProfile() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentUser, loading, error, isConfigured, config } = useCurrentUserData();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user || !currentUser || !config || !config.columnMapping) {
      setProfile(null);
      return;
    }

    // Map the contact data to a standardized profile format
    const mappedProfile: UserProfile = {
      id: currentUser.id,
      authUserId: user.id,
      name: config.columnMapping.nameColumn ? currentUser[config.columnMapping.nameColumn] : undefined,
      email: config.columnMapping.emailColumn ? currentUser[config.columnMapping.emailColumn] : user.email,
      phone: config.columnMapping.phoneColumn ? currentUser[config.columnMapping.phoneColumn] : undefined,
      avatar: config.columnMapping.avatarColumn ? currentUser[config.columnMapping.avatarColumn] : undefined,
      ...currentUser // Include all other fields from the contact record
    };

    setProfile(mappedProfile);
  }, [user, currentUser, isAuthenticated, config]);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile || !config) {
      throw new Error('No profile data available or user contact sync not configured');
    }

    try {
      // This would typically make an API call to update the contact record
      // For now, we'll just update the local state
      const response = await fetch(`/api/table-data/${config.contactsTable}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          id: profile.id,
          updates
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const updatedData = await response.json();
      setProfile(prev => prev ? { ...prev, ...updates } : null);

      return updatedData;
    } catch (err) {
      console.error('Profile update error:', err);
      throw err;
    }
  };

  return {
    profile,
    loading,
    error,
    isConfigured,
    isAuthenticated,
    hasProfile: !!profile,
    updateProfile,

    // Convenience getters
    displayName: profile?.name || profile?.email || 'Anonymous',
    initials: profile?.name
      ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase()
      : profile?.email?.[0]?.toUpperCase() || 'A'
  };
}