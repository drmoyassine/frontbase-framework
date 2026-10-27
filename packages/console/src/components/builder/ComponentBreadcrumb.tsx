import React from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface AncestryNode {
  id: string;
  type: string;
}

/**
 * Walks the component tree to build the ancestry path from root to targetId.
 * Returns an array of { id, type } from top-level down to the target.
 */
function findAncestry(components: any[], targetId: string, path: AncestryNode[] = []): AncestryNode[] | null {
  for (const component of components) {
    const currentPath = [...path, { id: component.id, type: component.type }];
    if (component.id === targetId) {
      return currentPath;
    }
    if (component.children) {
      const found = findAncestry(component.children, targetId, currentPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Breadcrumb bar displayed at the bottom of the canvas when a component is selected.
 * Shows the full ancestry path (Page > Container > Row > Column > Badge)
 * with each segment clickable to select that component.
 */
export const ComponentBreadcrumb: React.FC = () => {
  const { selectedComponentId, setSelectedComponentId, currentPageId, pages } = useBuilderStore(useShallow(s => ({
    selectedComponentId: s.selectedComponentId,
    setSelectedComponentId: s.setSelectedComponentId,
    currentPageId: s.currentPageId,
    pages: s.pages
  })));

  if (!selectedComponentId || !currentPageId) return null;

  const currentPage = pages.find(p => p.id === currentPageId);
  const components = currentPage?.layoutData?.content || [];

  const ancestry = findAncestry(components, selectedComponentId);
  if (!ancestry || ancestry.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t px-4 py-1.5">
      <Breadcrumb>
        <BreadcrumbList>
          {/* Page root */}
          <BreadcrumbItem>
            <BreadcrumbLink
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedComponentId(null);
              }}
              className="text-xs"
            >
              Page
            </BreadcrumbLink>
          </BreadcrumbItem>

          {ancestry.map((node, index) => {
            const isLast = index === ancestry.length - 1;
            return (
              <React.Fragment key={node.id}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-xs font-medium">
                      {node.type}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedComponentId(node.id);
                      }}
                      className="text-xs"
                    >
                      {node.type}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};
