import { HomepageTranslationWorkspace } from './HomepageTranslationWorkspace';
import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { TranslationPageWorkspace } from './TranslationPageWorkspace';
import { CustomBuilder } from './CustomBuilder';

export const FrontbaseBuilder: React.FC = () => {
  const [homepage, setHomepage] = useState(false);
  const [translating, setTranslating] = useState(false);
  const page = useBuilderStore(state => state.pages.find(page => page.id === state.currentPageId));
  if (homepage) return <HomepageTranslationWorkspace onClose={() => setHomepage(false)} />;
  if (translating && page) return <TranslationPageWorkspace key={page.id} page={page} onHomepage={() => setHomepage(true)} onClose={() => setTranslating(false)} />;
  return <CustomBuilder onTranslate={() => setTranslating(true)} />;
};