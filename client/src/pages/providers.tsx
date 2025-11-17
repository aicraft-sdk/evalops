import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  Plus, 
  Shield, 
  Activity, 
  TestTube, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Zap,
  DollarSign
} from "lucide-react";
import { ProviderConfigModal } from "@/components/ProviderConfigModal";
import { AddProviderModal } from "@/components/AddProviderModal";
import { apiRequest } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";

interface Provider {
  id: string;
  name: string;
  type: string;
  healthStatus: 'healthy' | 'degraded' | 'down';
  isActive: boolean;
  lastHealthCheck?: string;
  description?: string;
}

interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  error?: string;
}

export function Providers() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["/api/providers"],
  });

  const { data: healthData = [] } = useQuery({
    queryKey: ["/api/providers/health"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const testProviderMutation = useMutation({
    mutationFn: (providerId: string) => apiRequest("POST", `/api/providers/${providerId}/test`),
    onSuccess: (data: any, providerId) => {
      const provider = (providers as Provider[]).find((p: Provider) => p.id === providerId);
      toast({
        title: "Provider Test Successful",
        description: `${provider?.name} responded in ${data.latency || 0}ms with cost $${(data.cost || 0).toFixed(4)}`,
      });
    },
    onError: (error: any, providerId) => {
      const provider = (providers as Provider[]).find((p: Provider) => p.id === providerId);
      toast({
        title: "Provider Test Failed",
        description: `${provider?.name} test failed: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const getProviderIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'openai':
        return '🤖';
      case 'anthropic':
        return '🧠';
      case 'azure_openai':
        return '☁️';
      case 'google':
      case 'gemini':
        return '🔍';
      case 'xai':
        return '⚡';
      default:
        return '🔧';
    }
  };

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
      case 'degraded':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Degraded</Badge>;
      case 'down':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Down</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getProviderHealthStatus = (providerId: string): ProviderHealth | undefined => {
    return (healthData as ProviderHealth[]).find((h: ProviderHealth) => h.providerId === providerId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-spinner">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 space-y-6" data-testid="providers-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">AI Providers</h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Manage and configure AI providers for your evaluation workflows
          </p>
        </div>
        <Button 
          onClick={() => setShowAddModal(true)}
          data-testid="button-add-provider"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </Button>
      </div>

      {(providers as Provider[]).length === 0 ? (
        <Card data-testid="empty-state">
          <CardContent className="p-8 text-center">
            <Settings className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No AI Providers Configured</h3>
            <p className="text-muted-foreground mb-4">
              Get started by adding your first AI provider to enable evaluation workflows.
            </p>
            <Button 
              onClick={() => setShowAddModal(true)}
              data-testid="button-add-first-provider"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="providers-grid">
          {(providers as Provider[]).map((provider: Provider) => {
            const health = getProviderHealthStatus(provider.id);
            return (
              <Card key={provider.id} className="relative" data-testid={`provider-card-${provider.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getProviderIcon(provider.type)}</span>
                      <div>
                        <CardTitle className="text-lg" data-testid={`provider-name-${provider.id}`}>
                          {provider.name}
                        </CardTitle>
                        <CardDescription className="capitalize" data-testid={`provider-type-${provider.id}`}>
                          {provider.type.replace('_', ' ')}
                        </CardDescription>
                      </div>
                    </div>
                    {getHealthBadge(provider.healthStatus)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {provider.description && (
                    <p className="text-sm text-muted-foreground" data-testid={`provider-description-${provider.id}`}>
                      {provider.description}
                    </p>
                  )}

                  {health && (
                    <div className="grid grid-cols-2 gap-4 text-sm" data-testid={`provider-health-${provider.id}`}>
                      <div className="flex items-center space-x-1">
                        <Activity className="w-3 h-3 text-muted-foreground" />
                        <span>{health.responseTime}ms</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Shield className="w-3 h-3 text-muted-foreground" />
                        <span className="capitalize">{health.status}</span>
                      </div>
                    </div>
                  )}

                  {health?.error && (
                    <Alert variant="destructive" data-testid={`provider-error-${provider.id}`}>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-xs">
                        {health.error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedProvider(provider.id);
                        setShowConfigModal(true);
                      }}
                      data-testid={`button-configure-${provider.id}`}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Configure
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testProviderMutation.mutate(provider.id)}
                      disabled={testProviderMutation.isPending}
                      data-testid={`button-test-${provider.id}`}
                    >
                      <TestTube className="w-3 h-3 mr-1" />
                      Test
                    </Button>
                  </div>
                </CardContent>

                {!provider.isActive && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" data-testid={`provider-inactive-${provider.id}`}>
                      Inactive
                    </Badge>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Health Summary */}
      {(providers as Provider[]).length > 0 && (
        <Card data-testid="health-summary">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Provider Health Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span data-testid="health-healthy-count">
                  {(healthData as ProviderHealth[]).filter((h: ProviderHealth) => h.status === 'healthy').length} Healthy
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span data-testid="health-degraded-count">
                  {(healthData as ProviderHealth[]).filter((h: ProviderHealth) => h.status === 'degraded').length} Degraded
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span data-testid="health-down-count">
                  {(healthData as ProviderHealth[]).filter((h: ProviderHealth) => h.status === 'down').length} Down
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span data-testid="health-avg-response">
                  {Math.round((healthData as ProviderHealth[]).reduce((sum: number, h: ProviderHealth) => sum + h.responseTime, 0) / (healthData as ProviderHealth[]).length || 0)}ms avg
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {showConfigModal && selectedProvider && (
        <ProviderConfigModal
          providerId={selectedProvider}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedProvider(null);
          }}
        />
      )}

      {showAddModal && (
        <AddProviderModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
          }}
        />
      )}
        </div>
      </main>
    </div>
  );
}