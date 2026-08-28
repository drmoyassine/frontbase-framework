import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { themeAPI } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export interface ComponentTheme {
  id: string;
  name: string;
  component_type: string;
  styles_data: any;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export function useThemes(componentType?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryKey = ['componentThemes', componentType];

  const themesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await themeAPI.getThemes(componentType);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data as ComponentTheme[];
    },
    staleTime: 10 * 60 * 1000, // custom TTL (not a STALE tier)
  });

  const createThemeMutation = useMutation({
    mutationFn: async (themeData: { name: string; component_type: string; styles_data: any }) => {
      const response = await themeAPI.createTheme(themeData);
      if (!response.success) throw new Error(response.error);
      return response.data as ComponentTheme;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentThemes'] });
      toast({
        title: "Theme saved",
        description: "Your custom theme has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving theme",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  return {
    themes: themesQuery.data || [],
    isLoading: themesQuery.isLoading,
    createTheme: createThemeMutation.mutate,
    isCreating: createThemeMutation.isPending
  };
}
