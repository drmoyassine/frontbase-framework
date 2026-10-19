import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { TranslationPageWorkspace } from './TranslationPageWorkspace';
import { CustomBuilder } from './CustomBuilder';

export const FrontbaseBuilder: React.FC = () => {
  const [translating, setTranslating] = useState(false);
  const page = useBuilderStore(state => state.pages.find(page => page.id === state.currentPageId));
  if (translating && page) return <TranslationPageWorkspace key={page.id} page={page} onClose={() => setTranslating(false)} />;
  return <CustomBuilder onTranslate={() => setTranslating(true)} />;
};