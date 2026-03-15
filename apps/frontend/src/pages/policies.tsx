import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Shield, MoreHorizontal, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Policies() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: policies, isLoading: policiesLoading } = useQuery<any[]>({
    queryKey: ["/api/policies"],
    enabled: isAuthenticated,
  });

  const createPolicyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/policies", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Policy created",
        description: "Your policy has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create policy",
        variant: "destructive",
      });
    },
  });

  const handleCreatePolicy = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Build comprehensive rules object
    const rules = {
      // Quality thresholds
      passThreshold: parseFloat(formData.get("passThreshold") as string) || 0.8,
      warnThreshold: parseFloat(formData.get("warnThreshold") as string) || 0.6,
      
      // Cost limits
      costLimits: {
        maxCostPerRun: formData.get("maxCostPerRun") ? parseFloat(formData.get("maxCostPerRun") as string) : null,
        maxCostPerSample: formData.get("maxCostPerSample") ? parseFloat(formData.get("maxCostPerSample") as string) : null,
      },
      
      // Performance SLOs
      performanceSLOs: {
        maxLatency: formData.get("maxLatency") ? parseInt(formData.get("maxLatency") as string) : null,
        maxDuration: formData.get("maxDuration") ? parseInt(formData.get("maxDuration") as string) : null,
      },
      
      // Baseline comparison
      baselineComparison: {
        enabled: formData.get("enableBaseline") === "on",
        regressionThreshold: parseFloat(formData.get("regressionThreshold") as string) || 5,
      },
      
      enabled: true
    };
    
    createPolicyMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      rules,
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'fail':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'warn':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getRuleTypeColor = (type: string) => {
    switch (type) {
      case 'threshold':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'baseline_comparison':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'cost_limit':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'latency_slo':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'schema_validation':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-policies-title">Policies</h1>
              <p className="text-muted-foreground">Define and manage quality gate policies</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search policies..." 
                  className="pl-10 w-64"
                  data-testid="input-search-policies"
                />
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-policy">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Policy
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Policy</DialogTitle>
                    <DialogDescription>
                      Define quality gates and decision rules for evaluations.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreatePolicy} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Quality Gate Policy"
                        required
                        data-testid="input-policy-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Policy to ensure high quality responses"
                        data-testid="textarea-policy-description"
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Policy Rules</Label>
                      
                      {/* Threshold Rules */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Quality Thresholds</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="passThreshold" className="text-xs">Pass Threshold</Label>
                            <Input
                              id="passThreshold"
                              name="passThreshold"
                              type="number"
                              min="0"
                              max="1"
                              step="0.1"
                              defaultValue="0.8"
                              placeholder="0.8"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label htmlFor="warnThreshold" className="text-xs">Warn Threshold</Label>
                            <Input
                              id="warnThreshold"
                              name="warnThreshold"
                              type="number"
                              min="0"
                              max="1"
                              step="0.1"
                              defaultValue="0.6"
                              placeholder="0.6"
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Cost Limits */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Cost Limits</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="maxCostPerRun" className="text-xs">Max Cost per Run ($)</Label>
                            <Input
                              id="maxCostPerRun"
                              name="maxCostPerRun"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="5.00"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label htmlFor="maxCostPerSample" className="text-xs">Max Cost per Sample ($)</Label>
                            <Input
                              id="maxCostPerSample"
                              name="maxCostPerSample"
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder="0.10"
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Performance SLOs */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Performance SLOs</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="maxLatency" className="text-xs">Max Latency (ms)</Label>
                            <Input
                              id="maxLatency"
                              name="maxLatency"
                              type="number"
                              min="0"
                              placeholder="5000"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label htmlFor="maxDuration" className="text-xs">Max Duration (seconds)</Label>
                            <Input
                              id="maxDuration"
                              name="maxDuration"
                              type="number"
                              min="0"
                              placeholder="300"
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Baseline Comparison */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Baseline Comparison</h4>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="enableBaseline"
                            name="enableBaseline"
                            className="rounded"
                          />
                          <Label htmlFor="enableBaseline" className="text-xs">
                            Enable baseline regression detection
                          </Label>
                        </div>
                        <div>
                          <Label htmlFor="regressionThreshold" className="text-xs">Regression Threshold (%)</Label>
                          <Input
                            id="regressionThreshold"
                            name="regressionThreshold"
                            type="number"
                            min="0"
                            max="100"
                            defaultValue="5"
                            placeholder="5"
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createPolicyMutation.isPending}>
                        {createPolicyMutation.isPending ? "Creating..." : "Create Policy"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>
        
        <div className="p-6">
          <div className="grid gap-6">
            {policies?.map((policy: any) => (
              <Card key={policy.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">{policy.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Switch 
                            checked={policy.isActive} 
                            data-testid={`switch-active-${policy.id}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            {policy.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {policy.description}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" data-testid={`button-actions-${policy.id}`}>
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Rules</h4>
                      <div className="space-y-2">
                        {policy.rules ? (
                          <div className="space-y-3">
                            {/* Quality Thresholds */}
                            {(policy.rules.passThreshold || policy.rules.warnThreshold) && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-blue-100 text-blue-800 border-0">
                                    QUALITY THRESHOLDS
                                  </Badge>
                                </div>
                                <div className="text-sm space-y-1">
                                  {policy.rules.passThreshold && (
                                    <div>Pass: ≥ {policy.rules.passThreshold}</div>
                                  )}
                                  {policy.rules.warnThreshold && (
                                    <div>Warn: ≥ {policy.rules.warnThreshold}</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Cost Limits */}
                            {(policy.rules.costLimits?.maxCostPerRun || policy.rules.costLimits?.maxCostPerSample) && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-yellow-100 text-yellow-800 border-0">
                                    COST LIMITS
                                  </Badge>
                                </div>
                                <div className="text-sm space-y-1">
                                  {policy.rules.costLimits?.maxCostPerRun && (
                                    <div>Max per run: ${policy.rules.costLimits.maxCostPerRun}</div>
                                  )}
                                  {policy.rules.costLimits?.maxCostPerSample && (
                                    <div>Max per sample: ${policy.rules.costLimits.maxCostPerSample}</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Performance SLOs */}
                            {(policy.rules.performanceSLOs?.maxLatency || policy.rules.performanceSLOs?.maxDuration) && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-green-100 text-green-800 border-0">
                                    PERFORMANCE
                                  </Badge>
                                </div>
                                <div className="text-sm space-y-1">
                                  {policy.rules.performanceSLOs?.maxLatency && (
                                    <div>Max latency: {policy.rules.performanceSLOs.maxLatency}ms</div>
                                  )}
                                  {policy.rules.performanceSLOs?.maxDuration && (
                                    <div>Max duration: {policy.rules.performanceSLOs.maxDuration}s</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Baseline Comparison */}
                            {policy.rules.baselineComparison?.enabled && (
                              <div className="p-3 bg-muted/30 rounded-md">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-purple-100 text-purple-800 border-0">
                                    BASELINE COMPARISON
                                  </Badge>
                                </div>
                                <div className="text-sm">
                                  Regression threshold: {policy.rules.baselineComparison.regressionThreshold}%
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No rules defined</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t border-border">
                      <span>
                        Created {new Date(policy.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          data-testid={`button-simulate-${policy.id}`}
                          onClick={() => {
                            toast({
                              title: "Coming Soon",
                              description: "Policy simulation feature is coming soon",
                            });
                          }}
                        >
                          Simulate
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          data-testid={`button-edit-${policy.id}`}
                          onClick={() => {
                            toast({
                              title: "Coming Soon",
                              description: "Policy editing feature is coming soon",
                            });
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) || (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No policies found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first policy to enforce quality gates
                    </p>
                    <Button className="mt-4" data-testid="button-create-first-policy">
                      Create your first policy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
