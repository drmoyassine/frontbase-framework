import React, { useState } from 'react';
import { Eye, EyeOff, Settings2, X, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { isCloud } from '@/lib/edition';

const PLAN_TIERS = ['free', 'starter', 'pro', 'enterprise'];
const ROLES = ['owner', 'admin', 'editor', 'viewer'];

export const MasterAdminImpersonator: React.FC = () => {
    const { user, _realUser, isImpersonating, tenant, _realTenant, setImpersonation, clearImpersonation, isLoading } = useAuthStore();

    // ALL hooks must be called unconditionally — React Rules of Hooks
    const [isOpen, setIsOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState('pro');
    const [selectedRole, setSelectedRole] = useState('owner');

    // Feature is purely for Master Admins
    const isMaster = user?.is_master || _realUser?.is_master;

    // Sync plan/role defaults when auth state loads (avoids stale initial values)
    React.useEffect(() => {
        if (isImpersonating) {
            setSelectedPlan(_realTenant?.plan || tenant?.plan || 'pro');
            setSelectedRole(user?.role || _realUser?.role || 'owner');
        } else {
            setSelectedPlan(tenant?.plan || 'pro');
            setSelectedRole(user?.role || 'owner');
        }
    }, [user?.role, _realUser?.role, tenant?.plan, _realTenant?.plan, isImpersonating]);

    // Only render in cloud mode, and only for master admins
    if (!isCloud() || !isMaster) return null;

    const handleImpersonate = () => {
        setImpersonation(selectedPlan, selectedRole);
        setIsOpen(false);
    };

    const handleClear = () => {
        clearImpersonation();
        setIsOpen(false);
    };

    return (
        <div className="fixed bottom-6 left-[280px] z-[9999]">
            {/* Widget Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 border-2 
                        ${isImpersonating 
                            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 animate-pulse' 
                            : 'bg-slate-800 hover:bg-slate-900 text-white border-slate-700'
                        }`}
                    title={isImpersonating ? "UI Spoofing Active" : "Master Admin Controls"}
                >
                    {isImpersonating ? <Eye className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
                </button>
            )}

            {/* Expanded Menu */}
            {isOpen && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl w-72 overflow-hidden animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-500" />
                            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">UI Spoofing</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-3 rounded-lg text-xs flex gap-2 items-start">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Spoofing only affects the Frontend UI layout. API requests will still operate as Master Admin.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                Tenant Plan Tier
                            </label>
                            <select 
                                value={selectedPlan}
                                onChange={(e) => setSelectedPlan(e.target.value)}
                                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border-none rounded-md px-3 py-2 cursor-pointer focus:ring-2 focus:ring-primary/50"
                            >
                                {PLAN_TIERS.map(plan => (
                                    <option key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                User Role
                            </label>
                            <select 
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value)}
                                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border-none rounded-md px-3 py-2 cursor-pointer focus:ring-2 focus:ring-primary/50"
                            >
                                {ROLES.map(role => (
                                    <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2">
                        {isImpersonating && (
                            <button 
                                onClick={handleClear}
                                className="flex-1 text-xs font-medium px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                                Restore
                            </button>
                        )}
                        <button 
                            onClick={handleImpersonate}
                            className={`${isImpersonating ? 'flex-1' : 'w-full'} text-xs font-medium px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded shadow-sm transition-opacity`}
                        >
                            Spoof UI Status
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
