import { useState } from 'react';
import { Loader2, Plus, Trash2, Edit, Package, Code, FileText, Database, Globe, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentIntegrationsApi, AgentSkill, SkillCreate, SkillUpdate } from '@/services/agentIntegrationsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    utility: Zap,
    data: Database,
    integration: Globe,
    default: Package,
};

const CATEGORY_COLORS: Record<string, string> = {
    utility: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    data: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    integration: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

interface SkillFormProps {
    skill?: AgentSkill;
    onSave: (data: SkillCreate | SkillUpdate) => void;
    onCancel: () => void;
    saving?: boolean;
}

function SkillForm({ skill, onSave, onCancel, saving }: SkillFormProps) {
    const [name, setName] = useState(skill?.name || '');
    const [slug, setSlug] = useState(skill?.slug || '');
    const [description, setDescription] = useState(skill?.description || '');
    const [category, setCategory] = useState(skill?.category || 'utility');
    const [isActive, setIsActive] = useState(skill?.isActive ?? true);

    const handleSubmit = () => {
        if (!name.trim() || !slug.trim()) {
            toast.error('Name and slug are required');
            return;
        }
        const data: SkillCreate | SkillUpdate = {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || undefined,
            category: category.trim() || undefined,
            isActive,
            toolDefinitions: skill?.toolDefinitions || [],
        };
        onSave(data);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="skill-name">Name *</Label>
                    <Input
                        id="skill-name"
                        placeholder="Data Analysis"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="skill-slug">Slug *</Label>
                    <Input
                        id="skill-slug"
                        placeholder="data-analysis"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        disabled={saving}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="skill-category">Category</Label>
                <select
                    id="skill-category"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={saving}
                >
                    <option value="utility">Utility</option>
                    <option value="data">Data</option>
                    <option value="integration">Integration</option>
                </select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="skill-description">Description</Label>
                <Textarea
                    id="skill-description"
                    placeholder="Analyzes data and generates insights..."
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                />
            </div>

            {skill && (
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Tool Definitions</div>
                    <div className="text-xs text-slate-500">
                        {skill.toolDefinitions?.length || 0} tools defined in this skill
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    id="skill-active"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-slate-300"
                />
                <Label htmlFor="skill-active" className="text-sm">Active</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
                    {skill ? 'Update' : 'Create'} Skill
                </Button>
            </div>
        </div>
    );
}

interface BuiltinSkillCardProps {
    skill: AgentSkill;
    onInstall?: (skillId: string) => void;
    isInstalled?: boolean;
}

function BuiltinSkillCard({ skill, onInstall, isInstalled }: BuiltinSkillCardProps) {
    const Icon = CATEGORY_ICONS[skill.category || ''] || CATEGORY_ICONS.default;

    return (
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                        <Icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <div className="font-medium text-sm">{skill.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <code className="text-xs">{skill.slug}</code>
                            {skill.category && (
                                <>
                                    <span>•</span>
                                    <Badge className={CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.default}>
                                        {skill.category}
                                    </Badge>
                                </>
                            )}
                        </div>
                        {skill.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">
                                {skill.description}
                            </p>
                        )}
                    </div>
                </div>
                {onInstall && (
                    <Button
                        size="sm"
                        variant={isInstalled ? 'outline' : 'default'}
                        onClick={() => onInstall(skill.id)}
                        className={isInstalled ? '' : 'bg-purple-600 hover:bg-purple-700'}
                    >
                        {isInstalled ? 'Installed' : 'Install'}
                    </Button>
                )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Package className="w-3 h-3" />
                {skill.toolDefinitions?.length || 0} tools
                {skill.version && <span>• v{skill.version}</span>}
            </div>
        </div>
    );
}

interface Props {
    profileId?: string;
    profileSlug?: string;
}

export function SkillsManager({ profileId, profileSlug }: Props) {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['agent-skills', profileSlug],
        queryFn: () => agentIntegrationsApi.listSkills(profileSlug),
    });

    // Get installed skills for this profile
    const { data: installedData } = useQuery({
        queryKey: ['profile-skills', profileId],
        queryFn: () => agentIntegrationsApi.listProfileSkills(profileId || ''),
        enabled: !!profileId,
    });

    const installedSkillIds = new Set(installedData?.skills.map((s) => s.id) || []);

    const createMutation = useMutation({
        mutationFn: (data: SkillCreate) => agentIntegrationsApi.createSkill({ ...data, profileSlug }),
        onSuccess: () => {
            toast.success('Custom skill created');
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['agent-skills', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create skill'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: SkillUpdate }) =>
            agentIntegrationsApi.updateSkill(id, data),
        onSuccess: () => {
            toast.success('Skill updated');
            setEditingSkill(null);
            queryClient.invalidateQueries({ queryKey: ['agent-skills', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update skill'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => agentIntegrationsApi.deleteSkill(id),
        onSuccess: () => {
            toast.success('Skill deleted');
            queryClient.invalidateQueries({ queryKey: ['agent-skills', profileSlug] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete skill'),
    });

    const installMutation = useMutation({
        mutationFn: (skillId: string) =>
            agentIntegrationsApi.installSkill(profileId || '', { skillId }),
        onSuccess: () => {
            toast.success('Skill installed on profile');
            queryClient.invalidateQueries({ queryKey: ['profile-skills'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to install skill'),
    });

    const handleSave = (data: SkillCreate | SkillUpdate) => {
        if (editingSkill) {
            updateMutation.mutate({ id: editingSkill.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (skill: AgentSkill) => {
        if (confirm(`Delete custom skill "${skill.name}"?`)) {
            deleteMutation.mutate(skill.id);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
        );
    }

    const skills = data?.skills || [];
    const builtinSkills = skills.filter((s) => s.isBuiltin);
    const customSkills = skills.filter((s) => !s.isBuiltin);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-md font-semibold text-slate-900 dark:text-white">Agent Skills</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Installable skill bundles with packaged tool definitions
                </p>
            </div>

            <Tabs defaultValue="builtin">
                <TabsList>
                    <TabsTrigger value="builtin">
                        <Package className="w-4 h-4 mr-1" /> Built-in ({builtinSkills.length})
                    </TabsTrigger>
                    <TabsTrigger value="custom">
                        <Code className="w-4 h-4 mr-1" /> Custom ({customSkills.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="builtin" className="mt-4 space-y-3">
                    {builtinSkills.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            No built-in skills available
                        </div>
                    ) : (
                        builtinSkills.map((skill) => (
                            <BuiltinSkillCard
                                key={skill.id}
                                skill={skill}
                                onInstall={profileId ? (id) => installMutation.mutate(id) : undefined}
                                isInstalled={installedSkillIds.has(skill.id)}
                            />
                        ))
                    )}
                </TabsContent>

                <TabsContent value="custom" className="mt-4">
                    <div className="flex justify-between items-center mb-3">
                        <p className="text-xs text-slate-500">Custom skills you've created</p>
                        <Button size="sm" onClick={() => setShowForm(true)} className="bg-purple-600 hover:bg-purple-700">
                            <Plus className="w-4 h-4 mr-1" /> New Skill
                        </Button>
                    </div>

                    {customSkills.length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
                            <Code className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                            <p className="text-sm text-slate-500">No custom skills yet</p>
                            <p className="text-xs text-slate-400 mt-1">Create a skill to package custom tools</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {customSkills.map((skill) => (
                                <div
                                    key={skill.id}
                                    className={`p-3 rounded-lg border ${
                                        skill.isActive
                                            ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                            : 'border-slate-200 dark:border-slate-800 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm">{skill.name}</span>
                                                {skill.category && (
                                                    <Badge className={CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.default}>
                                                        {skill.category}
                                                    </Badge>
                                                )}
                                                {!skill.isActive && (
                                                    <Badge variant="outline" className="text-slate-500">Inactive</Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                <code className="text-xs">{skill.slug}</code>
                                                {skill.version && <span>• v{skill.version}</span>}
                                                <span>•</span>
                                                <Package className="w-3 h-3" />
                                                {skill.toolDefinitions?.length || 0} tools
                                            </div>
                                            {skill.description && (
                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                                                    {skill.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 ml-4">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingSkill(skill)}
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(skill)}
                                                disabled={deleteMutation.isPending}
                                                title="Delete"
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Create/Edit Dialog */}
            <Dialog open={showForm || !!editingSkill} onOpenChange={(open) => {
                if (!open) {
                    setShowForm(false);
                    setEditingSkill(null);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-500" />
                            {editingSkill ? 'Edit Custom Skill' : 'Create Custom Skill'}
                        </DialogTitle>
                        <DialogDescription>
                            Define a custom skill with packaged tool definitions
                        </DialogDescription>
                    </DialogHeader>
                    <SkillForm
                        skill={editingSkill || undefined}
                        onSave={handleSave}
                        onCancel={() => {
                            setShowForm(false);
                            setEditingSkill(null);
                        }}
                        saving={createMutation.isPending || updateMutation.isPending}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
