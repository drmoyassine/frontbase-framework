import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Shield, MoreVertical, Pencil, Trash2, Eye, FileEdit, FilePlus, FileX } from 'lucide-react';
import type { RLSPolicy } from '@/types/rls';
import { OPERATION_LABELS } from '@/types/rls';

interface RLSPolicyCardProps {
    policy: RLSPolicy;
    onEdit: (policy: RLSPolicy) => void;
    onDelete: (tableName: string, policyName: string) => Promise<void>;
}

/**
 * Get badge color based on operation type
 */
function getOperationColor(operation: string): string {
    switch (operation) {
        case 'SELECT':
            return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
        case 'INSERT':
            return 'bg-green-100 text-green-800 hover:bg-green-100';
        case 'UPDATE':
            return 'bg-amber-100 text-amber-800 hover:bg-amber-100';
        case 'DELETE':
            return 'bg-red-100 text-red-800 hover:bg-red-100';
        case 'ALL':
            return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
        default:
            return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
    }
}

/**
 * Get icon based on operation type
 */
function getOperationIcon(operation: string) {
    switch (operation) {
        case 'SELECT':
            return <Eye className="h-3 w-3" />;
        case 'INSERT':
            return <FilePlus className="h-3 w-3" />;
        case 'UPDATE':
            return <FileEdit className="h-3 w-3" />;
        case 'DELETE':
            return <FileX className="h-3 w-3" />;
        default:
            return <Shield className="h-3 w-3" />;
    }
}

/**
 * Truncate and format expression for display
 */
function formatExpression(expr: string | null, maxLength = 100): string {
    if (!expr) return 'No condition';
    const cleaned = expr.replace(/\s+/g, ' ').trim();
    if (cleaned.length > maxLength) {
        return cleaned.substring(0, maxLength) + '...';
    }
    return cleaned;
}

export function RLSPolicyCard({ policy, onEdit, onDelete }: RLSPolicyCardProps) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        await onDelete(policy.table_name, policy.policy_name);
        setIsDeleting(false);
        setShowDeleteDialog(false);
    };

    return (
        <>
            <Card className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                {policy.policy_name}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Table: <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{policy.table_name}</code>
                            </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                            <Badge
                                variant="secondary"
                                className={`text-xs font-medium flex items-center gap-1 ${getOperationColor(policy.operation)}`}
                            >
                                {getOperationIcon(policy.operation)}
                                {OPERATION_LABELS[policy.operation] || policy.operation}
                            </Badge>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(policy)}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit Policy
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-red-600"
                                        onClick={() => setShowDeleteDialog(true)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Policy
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                    {/* Policy type badge */}
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            {policy.is_permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
                        </Badge>
                        {policy.roles && policy.roles.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                                Roles: {policy.roles.join(', ')}
                            </span>
                        )}
                    </div>

                    {/* USING expression */}
                    {policy.using_expression && (
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                USING (read access)
                            </span>
                            <code className="block text-xs bg-slate-50 p-2 rounded border font-mono overflow-x-auto">
                                {formatExpression(policy.using_expression)}
                            </code>
                        </div>
                    )}

                    {/* WITH CHECK expression */}
                    {policy.check_expression && (
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                WITH CHECK (write access)
                            </span>
                            <code className="block text-xs bg-slate-50 p-2 rounded border font-mono overflow-x-auto">
                                {formatExpression(policy.check_expression)}
                            </code>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Policy</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the policy <strong>"{policy.policy_name}"</strong> from table <strong>"{policy.table_name}"</strong>?
                            <br /><br />
                            This action cannot be undone and may affect user access to this table.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Policy'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
