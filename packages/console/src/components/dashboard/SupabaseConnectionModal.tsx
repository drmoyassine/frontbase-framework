import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboard';
import { useToast } from '@/hooks/use-toast';
import api from '@/services/api-service';

export const SupabaseConnectionModal: React.FC = () => {
  const { supabaseModalOpen, setSupabaseModalOpen, fetchConnections } = useDashboardStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState({
    url: '',
    anonKey: '',
    serviceKey: '',
    includeServiceKey: false,
    jwtSecret: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const testConnection = async () => {
    if (!formData.url || !formData.anonKey) {
      toast({
        title: "Missing fields",
        description: "Please enter both URL and anon key",
        variant: "destructive"
      });
      return;
    }

    setTesting(true);
    try {
      const response = await api.post('/api/database/test-supabase', {
        url: formData.url,
        anonKey: formData.anonKey,
        serviceKey: formData.includeServiceKey ? formData.serviceKey : undefined
      });

      const data = response.data;
      if (data.success) {
        toast({
          title: "Connection successful",
          description: data.message || "Your Supabase credentials are valid",
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || data.error || "Invalid credentials",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Unable to reach Supabase server",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.url || !formData.anonKey) {
      toast({
        title: "Missing fields",
        description: "Please enter both URL and anon key",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/database/connect-supabase', {
        url: formData.url,
        anonKey: formData.anonKey,
        serviceKey: formData.includeServiceKey ? formData.serviceKey : undefined
      });

      const data = response.data;
      if (data.success) {
        toast({
          title: "Connection saved",
          description: "Supabase connection configured successfully",
        });
        await fetchConnections();
        setSupabaseModalOpen(false);
        setFormData({ url: '', anonKey: '', serviceKey: '', includeServiceKey: false, jwtSecret: '' });
      } else {
        toast({
          title: "Save failed",
          description: data.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Unable to save connection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={supabaseModalOpen} onOpenChange={setSupabaseModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to Supabase</DialogTitle>
          <DialogDescription>
            Enter your Supabase project credentials to enable database functionality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supabase-url">Project URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://your-project.supabase.co"
              value={formData.url}
              onChange={(e) => handleInputChange('url', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Find this in your Supabase dashboard under Settings → API
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase-anon-key">Anon Key</Label>
            <Input
              id="supabase-anon-key"
              type="password"
              placeholder="Your anon/public key"
              value={formData.anonKey}
              onChange={(e) => handleInputChange('anonKey', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This key is safe to use in client-side code
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-service-key"
              checked={formData.includeServiceKey}
              onCheckedChange={(checked) =>
                setFormData(prev => ({ ...prev, includeServiceKey: !!checked }))
              }
            />
            <Label htmlFor="include-service-key" className="text-sm">
              Include Service Key (for admin operations)
            </Label>
          </div>

          {formData.includeServiceKey && (
            <>
              <div className="space-y-2">
                <Label htmlFor="supabase-service-key">Service Key</Label>
                <Input
                  id="supabase-service-key"
                  type="password"
                  placeholder="Your service/secret key"
                  value={formData.serviceKey}
                  onChange={(e) => handleInputChange('serviceKey', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supabase-jwt-secret">JWT Secret (optional)</Label>
                <Input
                  id="supabase-jwt-secret"
                  type="password"
                  placeholder="Your JWT secret"
                  value={formData.jwtSecret}
                  onChange={(e) => handleInputChange('jwtSecret', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Found in Supabase Dashboard → Settings → API → JWT Settings. Required for edge auth.
                </p>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Service keys have admin privileges. They are encrypted and stored securely on the server.
                </AlertDescription>
              </Alert>
            </>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing || !formData.url || !formData.anonKey}
              className="flex-1"
            >
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !formData.url || !formData.anonKey}
              className="flex-1"
            >
              {loading ? "Saving..." : "Save Connection"}
            </Button>
          </div>

          <div className="pt-2 border-t">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Don't have a Supabase account? Sign up free
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};