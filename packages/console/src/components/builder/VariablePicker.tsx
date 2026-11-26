import { useBuilderStore } from '@/stores/builder';
import { inlineTemplateScopes } from '@frontbase/edge-core';
import { resolveBlockTree } from '@frontbase/edge-core/block-versions';
import { useVariables } from '@/hooks/useVariables';
import { useShallow } from 'zustand/react/shallow';
import { LogicSnippetWizard } from './LogicSnippetWizard';
import { VariablePickerView, type VariablePickerProps } from './VariablePickerView';

export function VariablePicker(props: VariablePickerProps) {
    const {pageId,nodeId,layout,versions} = useBuilderStore(useShallow(state => ({
        pageId:state.currentPageId??undefined,nodeId:state.selectedComponentId,
        layout:state.pages?.find(page=>page.id===state.currentPageId)?.layoutData,versions:state.editingVersions,
    })));
    const {detailColumns}=useVariables(pageId);
    const scope=layout&&nodeId&&detailColumns
        ? inlineTemplateScopes(resolveBlockTree(layout.content,()=>undefined,versions),detailColumns).get(nodeId) : undefined;
    const recordColumns = scope?.detailRole&&detailColumns?.[scope.detailRole]!==undefined ? scope.fields : props.recordColumns;
    return <VariablePickerView {...props} recordColumns={recordColumns} pageId={pageId} renderWizard={(snippet, close, insert) =>
        <LogicSnippetWizard snippet={snippet} open onClose={close} onInsert={insert} />} />;
}
