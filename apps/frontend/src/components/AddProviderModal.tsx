import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

const addProviderSchema = z.object({
  name: z.string().min(1, "Provider name is required"),
  type: z.string().min(1, "Provider type is required"),
  description: z.string().optional(),
});

type AddProviderFormData = z.infer<typeof addProviderSchema>;

interface AddProviderModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PROVIDER_TYPES = [
  {
    value: "openai",
    label: "OpenAI",
    description: "GPT models from OpenAI",
    icon: "🤖"
  },
  {
    value: "anthropic",
    label: "Anthropic",
    description: "Claude models from Anthropic",
    icon: "🧠"
  },
  {
    value: "azure_openai",
    label: "Azure OpenAI",
    description: "OpenAI models on Azure",
    icon: "☁️"
  },
  {
    value: "google",
    label: "Google Gemini",
    description: "Google's Gemini models",
    icon: "🔍"
  },
  {
    value: "xai",
    label: "xAI Grok",
    description: "Grok models from xAI",
    icon: "⚡"
  }
];

export function AddProviderModal({ onClose, onSuccess }: AddProviderModalProps) {
  const { toast } = useToast();

  const form = useForm<AddProviderFormData>({
    resolver: zodResolver(addProviderSchema),
    defaultValues: {
      name: "",
      type: "",
      description: "",
    },
  });

  const addProviderMutation = useMutation({
    mutationFn: (data: AddProviderFormData) => apiRequest("POST", "/api/providers", data),
    onSuccess: () => {
      toast({
        title: "Provider Added",
        description: "AI provider has been added successfully. You can now configure it.",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Provider",
        description: `Failed to add provider: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddProviderFormData) => {
    addProviderMutation.mutate(data);
  };

  const selectedType = form.watch("type");
  const selectedProviderInfo = PROVIDER_TYPES.find(p => p.value === selectedType);

  // Auto-generate name when type is selected
  const handleTypeChange = (type: string) => {
    form.setValue("type", type);
    const providerInfo = PROVIDER_TYPES.find(p => p.value === type);
    if (providerInfo && !form.getValues("name")) {
      form.setValue("name", `${providerInfo.label} Provider`);
    }
    if (providerInfo && !form.getValues("description")) {
      form.setValue("description", providerInfo.description);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="add-provider-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">Add AI Provider</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="add-provider-form">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-provider-type">Provider Type *</FormLabel>
                  <Select onValueChange={handleTypeChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-provider-type">
                        <SelectValue placeholder="Select a provider type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROVIDER_TYPES.map((provider) => (
                        <SelectItem 
                          key={provider.value} 
                          value={provider.value}
                          data-testid={`option-${provider.value}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span>{provider.icon}</span>
                            <div>
                              <div className="font-medium">{provider.label}</div>
                              <div className="text-sm text-muted-foreground">
                                {provider.description}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-provider-name">Provider Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Production OpenAI"
                      {...field}
                      data-testid="input-provider-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-provider-description">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this provider's purpose..."
                      rows={3}
                      {...field}
                      data-testid="input-provider-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProviderInfo && (
              <div className="bg-muted p-4 rounded-lg" data-testid="provider-info">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">{selectedProviderInfo.icon}</span>
                  <h4 className="font-medium">{selectedProviderInfo.label}</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedProviderInfo.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  After adding, you'll need to configure the API key and other settings 
                  to start using this provider.
                </p>
              </div>
            )}

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
                disabled={addProviderMutation.isPending}
                data-testid="button-add"
              >
                <Plus className="w-4 h-4 mr-2" />
                {addProviderMutation.isPending ? "Adding..." : "Add Provider"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}