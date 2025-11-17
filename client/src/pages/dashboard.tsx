import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { RecentRunsTable } from "@/components/dashboard/recent-runs-table";
import { PolicyViolations } from "@/components/dashboard/policy-violations";
import { DriftIndicators } from "@/components/dashboard/drift-indicators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Download, Zap, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const rerunFormSchema = z.object({
  evalSpecId: z.string().min(1, "Evaluation spec is required"),
  policyId: z.string().min(1, "Policy is required"),
  description: z.string().optional(),
});

type RerunFormValues = z.infer<typeof rerunFormSchema>;

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [rerunDialogOpen, setRerunDialogOpen] = useState(false);
  const [rerunRunId, setRerunRunId] = useState<string | null>(null);

  const form = useForm<RerunFormValues>({
    resolver: zodResolver(rerunFormSchema),
    defaultValues: {
      evalSpecId: "",
      policyId: "",
      description: "",
    },
  });

  // Mutation for setting baseline
  const setBaselineMutation = useMutation({
    mutationFn: async ({ runId, description }: { runId: string; description?: string }) => {
      return await apiRequest('POST', '/api/baselines', { runId, description: description || '' });
    },
    onSuccess: () => {
      toast({
        title: "Baseline Set",
        description: "The run has been set as the new baseline."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to set baseline. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Mutation for creating evaluation runs (used for rerun too)
  const createRunMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/runs', data);
    },
    onSuccess: () => {
      toast({
        title: "Evaluation Started",
        description: "The evaluation has been started successfully."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      setRerunDialogOpen(false);
      setRerunRunId(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start evaluation. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleViewDetails = (runId: string) => {
    // This is handled in the RecentRunsTable component
    console.log('Viewing details for run:', runId);
  };

  const handleSetBaseline = (runId: string) => {
    setBaselineMutation.mutate({ runId });
  };

  const handleRerun = (runId: string) => {
    const originalRun = runs?.find(r => r.id === runId);
    if (originalRun) {
      form.reset({
        evalSpecId: originalRun.evalSpecId,
        policyId: originalRun.policyId,
        description: `Rerun of ${originalRun.name || originalRun.id.slice(0, 8)}`,
      });
    }
    setRerunRunId(runId);
    setRerunDialogOpen(true);
  };

  const handleRerunRun = (data: RerunFormValues) => {
    createRunMutation.mutate(data);
  };

  const handleTestPolicies = (runId: string) => {
    // TODO: Implement policy testing
    toast({
      title: "Feature Coming Soon",
      description: "Policy testing will be available in a future update."
    });
  };

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery<{
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
  });

  const { data: runs, isLoading: runsLoading } = useQuery<any[]>({
    queryKey: ["/api/runs"],
    enabled: isAuthenticated,
  });

  const { data: violations, isLoading: violationsLoading } = useQuery<any[]>({
    queryKey: ["/api/policy-violations"],
    enabled: isAuthenticated,
  });

  const { data: evalSpecs } = useQuery<any[]>({
    queryKey: ["/api/eval-specs"],
    enabled: isAuthenticated,
  });

  const { data: policies } = useQuery<any[]>({
    queryKey: ["/api/policies"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-4 sm:px-6 py-4 sticky top-0 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-12 md:pt-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
              <p className="text-muted-foreground text-sm sm:text-base">Monitor evaluation runs and quality gates</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button variant="outline" data-testid="button-export" className="flex-1 sm:flex-none">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button data-testid="button-run-evaluation" className="flex-1 sm:flex-none">
                <Zap className="w-4 h-4 mr-2" />
                Run Evaluation
              </Button>
            </div>
          </div>
        </header>
        
        <div className="p-4 sm:p-6">
          {/* Stats Overview */}
          <StatsGrid stats={stats} isLoading={statsLoading} />
          
          {/* Recent Runs Table */}
          <div className="mb-8">
            <RecentRunsTable 
          runs={runs} 
          isLoading={runsLoading} 
          onViewDetails={handleViewDetails}
          onSetBaseline={handleSetBaseline}
          onRerun={handleRerun}
          onTestPolicies={handleTestPolicies}
        />
          </div>
          
          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <PolicyViolations violations={violations} isLoading={violationsLoading} />
            <DriftIndicators stats={stats} isLoading={statsLoading} />
          </div>
        </div>

        {/* Rerun Dialog */}
        <Dialog open={rerunDialogOpen} onOpenChange={setRerunDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rerun Evaluation</DialogTitle>
              <DialogDescription>
                Rerun this evaluation with the same or modified parameters
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleRerunRun)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="evalSpecId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Evaluation Spec</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select eval spec" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {evalSpecs?.map((spec) => (
                            <SelectItem key={spec.id} value={spec.id}>
                              {spec.name}
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
                  name="policyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Policy</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select policy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {policies?.map((policy) => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name}
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rerun evaluation"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setRerunDialogOpen(false);
                      setRerunRunId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRunMutation.isPending}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {createRunMutation.isPending ? "Starting..." : "Rerun Evaluation"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
