import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertiesPanel } from './PropertiesPanel';
import { StylingPanel } from './StylingPanel';
import { Settings, Palette } from 'lucide-react';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState('properties');

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 m-3 mb-2 p-1">
          <TabsTrigger
            value="properties"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 h-10"
          >
            <Settings className="h-4 w-4" />
            <span className="font-medium">Properties</span>
          </TabsTrigger>
          <TabsTrigger
            value="styling"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 h-10"
          >
            <Palette className="h-4 w-4" />
            <span className="font-medium">Styling</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="properties" className="flex-1 m-0">
          <PropertiesPanel />
        </TabsContent>
        
        <TabsContent value="styling" className="flex-1 m-0">
          <StylingPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};