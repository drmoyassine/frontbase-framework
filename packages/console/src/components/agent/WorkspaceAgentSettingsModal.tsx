/**
 * WorkspaceAgentSettingsModal — tenant/user-side agent overrides.
 *
 * Opened from the gear icon in the Workspace Agent widget header. Scope:
 *   • General tab  — temperature, max_tokens, top_p, timeout
 *   • Tools tab    — enable/disable MCP servers, skills, and core tools
 *
 * System prompts are now master-admin-only. Tenants can only disable
 * specific tools and integrations from the global catalogue.
 *
 * Settings persist via /api/agent/settings and apply on the next agent turn.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, RotateCcw, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { agentSettingsApi } from '@/services/agentSettingsApi';
import { agentCatalogueApi } from '@/services/agentCatalogueApi';
import type {
  AgentSettings,
  AgentSettingsGeneral,
  AgentSettingsSystem,
  SettingsSource,
  CatalogueResponse,
  CatalogueMcpServer,
  CatalogueSkill,
  CatalogueCoreTool,
} from '@/types/agentSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful save/reset so the chat can react if needed. */
  onSettingsApplied?: () => void;
}

const INHERITED_LABEL: Record<SettingsSource, string> = {
  user: 'Your overrides',
  tenant: 'Inherited from tenant',
  profile: 'Inherited from admin profile',
  default: 'System defaults',
};

function equalSettings(a: AgentSettings, b: AgentSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const WorkspaceAgentSettingsModal: React.FC<Props> = ({ open, onClose, onSettingsApplied }) => {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [baseline, setBaseline] = useState<AgentSettings | null>(null);
  const [inheritedFrom, setInheritedFrom] = useState<SettingsSource>('default');
  const [canModifyTenant, setCanModifyTenant] = useState(false);
  const [scope, setScope] = useState<'user' | 'tenant'>('user');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Catalogue data for the Tools tab
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);

  // Load effective settings and catalogue whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setCatalogueLoading(true);

    Promise.all([
      agentSettingsApi.get().then((res) => res),
      agentCatalogueApi.get().then((res) => res),
    ])
      .then(([settingsRes, catalogueRes]) => {
        if (cancelled) return;
        setSettings(settingsRes.settings);
        setBaseline(settingsRes.settings);
        setInheritedFrom(settingsRes.inherited_from);
        setCanModifyTenant(settingsRes.can_modify_tenant);
        setCatalogue(catalogueRes);
        setScope('user');
      })
      .catch((err) => {
        console.error('Failed to load agent settings:', err);
        toast.error('Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setCatalogueLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasChanges = !!settings && !!baseline && !equalSettings(settings, baseline);

  const updateGeneral = <K extends keyof AgentSettingsGeneral>(key: K, value: AgentSettingsGeneral[K]) => {
    setSettings((prev) => (prev ? { ...prev, general: { ...prev.general, [key]: value } } : prev));
  };

  const toggleMcpServer = (serverId: string, disabled: boolean) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const disabledList = disabled
        ? [...prev.system.disabled_mcp_servers, serverId]
        : prev.system.disabled_mcp_servers.filter((id) => id !== serverId);
      return { ...prev, system: { ...prev.system, disabled_mcp_servers: disabledList } };
    });
  };

  const toggleSkill = (skillSlug: string, disabled: boolean) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const disabledList = disabled
        ? [...prev.system.disabled_skills, skillSlug]
        : prev.system.disabled_skills.filter((slug) => slug !== skillSlug);
      return { ...prev, system: { ...prev.system, disabled_skills: disabledList } };
    });
  };

  const toggleCoreTool = (toolName: string, disabled: boolean) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const disabledList = disabled
        ? [...prev.system.disabled_tools, toolName]
        : prev.system.disabled_tools.filter((name) => name !== toolName);
      return { ...prev, system: { ...prev.system, disabled_tools: disabledList } };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await agentSettingsApi.update({ ...settings, scope });
      toast.success(scope === 'tenant' ? 'Tenant defaults saved' : 'Settings saved');
      setBaseline(settings);
      onSettingsApplied?.();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : 'Failed to save settings';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const target = scope === 'tenant' ? 'tenant-wide defaults' : 'your overrides';
    if (!window.confirm(`Reset ${target} to the lower layer? This cannot be undone.`)) return;
    try {
      await agentSettingsApi.reset(scope);
      toast.success('Reset to defaults');
      const res = await agentSettingsApi.get();
      setSettings(res.settings);
      setBaseline(res.settings);
      setInheritedFrom(res.inherited_from);
      onSettingsApplied?.();
    } catch (err) {
      console.error('Failed to reset settings:', err);
      toast.error('Failed to reset settings');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Agent settings"
      onClick={onClose}
    >
      <div
        className="bg-background flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Settings className="text-primary h-5 w-5" />
            <div>
              <h2 className="text-base font-semibold leading-tight">Agent Settings</h2>
              <p className="text-muted-foreground text-xs">{INHERITED_LABEL[inheritedFrom]}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scope toggle (admins only) */}
        {canModifyTenant && (
          <div className="bg-muted/40 flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
            <Info className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground">Apply to:</span>
            <div className="bg-background flex items-center gap-0.5 rounded-md p-0.5">
              {(['user', 'tenant'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    scope === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'user' ? 'Just me' : 'Entire tenant'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        {loading || !settings ? (
          <div className="flex flex-1 items-center justify-center p-12">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-4 grid w-auto grid-cols-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="tools">Tools & Integrations</TabsTrigger>
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 pb-4">
                {/* General */}
                <TabsContent value="general" className="mt-0 space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="temperature">Temperature</Label>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {settings.general.temperature.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="temperature"
                      value={[settings.general.temperature]}
                      onValueChange={([v]) => updateGeneral('temperature', v)}
                      min={0}
                      max={2}
                      step={0.05}
                    />
                    <p className="text-muted-foreground text-xs">
                      Lower is focused and deterministic; higher is more creative.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_tokens">Max tokens</Label>
                    <Input
                      id="max_tokens"
                      type="number"
                      value={settings.general.max_tokens ?? ''}
                      onChange={(e) =>
                        updateGeneral('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)
                      }
                      min={1}
                      max={200000}
                      placeholder="Auto (model default)"
                    />
                    <p className="text-muted-foreground text-xs">
                      Maximum response length. Leave empty to use the model default.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="top_p">Top P</Label>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {settings.general.top_p.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="top_p"
                      value={[settings.general.top_p]}
                      onValueChange={([v]) => updateGeneral('top_p', v)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-muted-foreground text-xs">
                      Nucleus sampling — controls diversity via probability mass.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeout">Response timeout (seconds)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      value={settings.general.timeout_seconds}
                      onChange={(e) =>
                        updateGeneral('timeout_seconds', parseInt(e.target.value, 10) || 60)
                      }
                      min={10}
                      max={600}
                    />
                  </div>
                </TabsContent>

                {/* Tools & Integrations */}
                <TabsContent value="tools" className="mt-0 space-y-6">
                  {catalogueLoading || !catalogue ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* MCP Servers */}
                      {catalogue.mcpServers.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">MCP Servers</h3>
                          <p className="text-muted-foreground text-xs">
                            External servers that provide additional tools. Disable to prevent the agent from using them.
                          </p>
                          {catalogue.mcpServers.map((server) => (
                            <div key={server.id} className="flex items-center justify-between rounded-md border border-border p-3">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{server.name}</div>
                                <div className="text-muted-foreground text-xs">{server.slug}</div>
                              </div>
                              <Switch
                                checked={!settings.system.disabled_mcp_servers.includes(server.id)}
                                onCheckedChange={(checked) => toggleMcpServer(server.id, !checked)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Skills */}
                      {catalogue.skills.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">Skills</h3>
                          <p className="text-muted-foreground text-xs">
                            Pre-built skill bundles. Disable to prevent the agent from using them.
                          </p>
                          {catalogue.skills.map((skill) => (
                            <div key={skill.id} className="flex items-center justify-between rounded-md border border-border p-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{skill.name}</span>
                                  {skill.isBuiltin && (
                                    <span className="text-muted-foreground text-xs rounded bg-muted px-1.5 py-0.5">Built-in</span>
                                  )}
                                </div>
                                <div className="text-muted-foreground text-xs">{skill.slug}</div>
                              </div>
                              <Switch
                                checked={!settings.system.disabled_skills.includes(skill.slug)}
                                onCheckedChange={(checked) => toggleSkill(skill.slug, !checked)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Core Tools */}
                      {catalogue.coreTools.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">Core Tools</h3>
                          <p className="text-muted-foreground text-xs">
                            Built-in tools for pages, styles, datasources, and more. Disable to prevent the agent from using them.
                          </p>
                          {catalogue.coreTools.map((tool) => (
                            <div key={tool.name} className="flex items-center justify-between rounded-md border border-border p-3">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{tool.label}</div>
                                <div className="text-muted-foreground text-xs">{tool.category}</div>
                              </div>
                              <Switch
                                checked={!settings.system.disabled_tools.includes(tool.name)}
                                onCheckedChange={(checked) => toggleCoreTool(tool.name, !checked)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {catalogue.mcpServers.length === 0 && catalogue.skills.length === 0 && catalogue.coreTools.length === 0 && (
                        <div className="bg-muted/50 text-muted-foreground rounded-lg p-4 text-sm text-center">
                          No tools or integrations available.
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}

        {/* Footer */}
        <div className="bg-muted/30 flex items-center justify-between gap-2 border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={loading || saving}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving || loading}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WorkspaceAgentSettingsModal;
