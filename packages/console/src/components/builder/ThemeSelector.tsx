import React, { useState } from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Palette } from 'lucide-react';
import { useThemes } from '@/hooks/useThemes';
import type { StylesData } from '@/lib/styles/types';

interface ThemeSelectorProps {
  componentType: string;
  currentStyles: StylesData | undefined;
  onApplyTheme: (stylesData: StylesData) => void;
}

export function ThemeSelector({ componentType, currentStyles, onApplyTheme }: ThemeSelectorProps) {
  const { themes, isLoading, createTheme, isCreating } = useThemes(componentType);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [themeName, setThemeName] = useState("");

  const handleApplyTheme = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (theme && theme.styles_data) {
      // Patch the entire styles_data from the theme
      onApplyTheme(theme.styles_data);
    }
  };

  const handleSaveTheme = async () => {
    if (!themeName.trim()) return;
    if (!currentStyles) return;

    await createTheme({
      name: themeName,
      component_type: componentType,
      styles_data: currentStyles
    });
    
    setSaveDialogOpen(false);
    setThemeName("");
  };

  // Only render if there are themes available OR if we can create one
  const isSmartBlock = ['InfoList', 'Form', 'DataTable'].includes(componentType);
  
  if (!isSmartBlock) return null;

  const systemThemes = themes.filter(t => t.is_system);
  const customThemes = themes.filter(t => !t.is_system);

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />
          Component Theme
        </Label>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-6 px-2 text-[10px] w-auto h-auto min-h-0 py-1"
          onClick={() => setSaveDialogOpen(true)}
          disabled={!currentStyles}
        >
          <Save className="h-3 w-3 mr-1" />
          Save Current
        </Button>
      </div>
      
      <Select onValueChange={handleApplyTheme} disabled={isLoading || themes.length === 0}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={isLoading ? "Loading themes..." : "Select a theme..."} />
        </SelectTrigger>
        <SelectContent>
          {systemThemes.length > 0 && (
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              System Templates
            </div>
          )}
          {systemThemes.map(theme => (
            <SelectItem key={theme.id} value={theme.id} className="text-xs">
              {theme.name}
            </SelectItem>
          ))}
          
          {customThemes.length > 0 && (
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1 border-t">
              Your Saved Themes
            </div>
          )}
          {customThemes.map(theme => (
            <SelectItem key={theme.id} value={theme.id} className="text-xs">
              {theme.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Custom Theme</DialogTitle>
            <DialogDescription>
              Save your current visual and custom CSS settings as a reusable theme for all {componentType} blocks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Theme Name</Label>
              <Input
                id="name"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="e.g. Neon Border Style"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTheme} disabled={!themeName.trim() || isCreating}>
              {isCreating ? "Saving..." : "Save Theme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
