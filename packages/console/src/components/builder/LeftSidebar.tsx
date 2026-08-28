import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComponentPalette } from './ComponentPalette';
import { LayersPanel } from './LayersPanel';
import { Layers, Package } from 'lucide-react';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState('components');

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 m-3 mb-2 p-1">
          <TabsTrigger
            value="components"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 h-10"
          >
            <Package className="h-4 w-4" />
            <span className="font-medium">Components</span>
          </TabsTrigger>
          <TabsTrigger
            value="layers"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 h-10"
          >
            <Layers className="h-4 w-4" />
            <span className="font-medium">Layers</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="flex-1 m-0">
          <ComponentPalette />
        </TabsContent>

        <TabsContent value="layers" className="flex-1 m-0">
          <LayersPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};