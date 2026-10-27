import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Home } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';

export const PageSelector: React.FC = () => {
  const { pages, currentPageId, setCurrentPage } = useBuilderStore(useShallow(s => ({
    pages: s.pages,
    currentPageId: s.currentPageId,
    setCurrentPage: s.setCurrentPage
  })));

  const currentPage = pages.find(page => page.id === currentPageId);

  return (
    <Select value={currentPageId || ''} onValueChange={setCurrentPage}>
      <SelectTrigger className="w-full min-w-0 sm:w-48" title={currentPage?.name} aria-label="Select page">
        <SelectValue placeholder="Select a page">
          {currentPage && (
            <div className="flex min-w-0 items-center gap-2">
              {currentPage.isHomepage ? (
                <Home className="h-4 w-4 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{currentPage.name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {pages.map((page) => (
          <SelectItem key={page.id} value={page.id}>
            <div className="flex items-center gap-2">
              {page.isHomepage ? (
                <Home className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {page.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
