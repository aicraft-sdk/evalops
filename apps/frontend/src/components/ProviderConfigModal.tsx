import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Save } from "lucide-react";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

const configSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  model: z.string().min(1, "Default model is required"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(100000).default(4000),
  timeout: z.number().min(1000).max(120000).default(30000),
  isActive: z.boolean().default(true),
});

type ConfigFormData = z.infer<typeof configSchema>;

interface ProviderConfigModalProps {
  providerId: string;
  onClose: () => void;
}

export function ProviderConfigModal({ providerId, onClose }: ProviderConfigModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery({
    queryKey: [`/api/providers/${providerId}/config`],
  });

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      temperature: 0.7,
      maxTokens: 4000,
      timeout: 30000,
      isActive: true,
    },
  });

  // Update form when config loads
  useEffect(() => {
    if (config && typeof config === 'object') {
      form.reset({
        ...config,
        apiKey: (config as any).apiKey === '***' ? '' : (config as any).apiKey, // Clear masked API key
      });
    }
  }, [config, form]);

  const saveConfigMutation = useMutation({
    mutationFn: (data: ConfigFormData) => apiRequest("POST", `/api/providers/${providerId}/config`, data),
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "Provider configuration has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerId}/config`] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Configuration Failed",
        description: `Failed to save configuration: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ConfigFormData) => {
    saveConfigMutation.mutate(data);
  };

  const getProviderDefaults = (providerId: string) => {
    // These would typically come from the provider data
    const defaults: Record<string, Partial<ConfigFormData>> = {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 4000,
      },
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.7,
        maxTokens: 4000,
      },
      azure_openai: {
        model: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 4000,
      },
      google: {
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-1.5-pro",
        temperature: 0.7,
        maxTokens: 4000,
      },
      xai: {
        baseUrl: "https://api.x.ai/v1",
        model: "grok-2-1212",
        temperature: 0.7,
        maxTokens: 4000,
      },
    };
    return defaults[providerId] || {};
  };

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent data-testid="provider-config-modal">
          <DialogHeader>
            <DialogTitle>Configure Provider</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center h-32" data-testid="loading-spinner">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="provider-config-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">Configure Provider</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="config-form">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-api-key">API Key *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        placeholder="Enter your API key"
                        {...field}
                        data-testid="input-api-key"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                        data-testid="button-toggle-api-key"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-base-url">
                    Base URL <span className="text-muted-foreground">(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Leave empty for default (only needed for Azure or custom endpoints)"
                      {...field}
                      data-testid="input-base-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-model">Default Model *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="gpt-4"
                      {...field}
                      data-testid="input-model"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-temperature">Temperature</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-temperature"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxTokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-max-tokens">Max Tokens</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="100000"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-max-tokens"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timeout"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-timeout">Timeout (ms)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1000"
                        max="120000"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-timeout"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base" data-testid="label-is-active">
                      Active Provider
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Enable this provider for evaluation workflows
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={saveConfigMutation.isPending}
                data-testid="button-save"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}