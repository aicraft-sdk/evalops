import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Filter, Zap, MoreHorizontal, Target, TestTube, Eye, Baseline, RotateCcw } from "lucide-react";
import { RunDetailsModal } from "@/components/RunDetailsModal";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const runFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  evalSpecId: z.string().min(1, "Evaluation spec is required"),
  policyId: z.string().min(1, "Policy is required"),
  description: z.string().optional(),
});

type RunFormValues = z.infer<typeof runFormSchema>;

export default function Runs() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [baselineDialogOpen, setBaselineDialogOpen] = useState(false);
  const [policyTestDialogOpen, setPolicyTestDialogOpen] = useState(false);
  const [runDetailsOpen, setRunDetailsOpen] = useState(false);
  const [detailsRunId, setDetailsRunId] = useState<string | null>(null);
  const [rerunDialogOpen, setRerunDialogOpen] = useState(false);
  const [rerunRunId, setRerunRunId] = useState<string | null>(null);
  
  const form = useForm<RunFormValues>({
    resolver: zodResolver(runFormSchema),
    defaultValues: {
      name: "",
      evalSpecId: "",
      policyId: "",
      description: "",
    },
  });

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

  const { data: runs } = useQuery<any[]>({
    queryKey: ["/api/runs"],
    enabled: isAuthenticated,
    refetchInterval: 3000, // Refresh every 3 seconds for real-time updates
    refetchIntervalInBackground: true,
  });

  const { data: evalSpecs } = useQuery<any[]>({
    queryKey: ["/api/eval-specs"],
    enabled: isAuthenticated,
  });

  const { data: policies } = useQuery<any[]>({
    queryKey: ["/api/policies"],
    enabled: isAuthenticated,
  });

  const createRunMutation = useMutation({
    mutationFn: async (data: RunFormValues) => {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          description: data.description || "Manual evaluation run",
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create run");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      setIsCreateDialogOpen(false);
      setRerunDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Evaluation run created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create run",
        variant: "destructive",
      });
    },
  });

  const handleCreateRun = (data: RunFormValues) => {
    createRunMutation.mutate(data);
  };

  const handleRerun = (runId: string) => {
    const originalRun = runs?.find(r => r.id === runId);
    if (originalRun) {
      form.reset({
        name: `Rerun - ${originalRun.name}`,
        evalSpecId: originalRun.evalSpecId,
        policyId: originalRun.policyId,
        description: `Rerun of ${originalRun.id.slice(0, 8)}`,
      });
    }
    setRerunRunId(runId);
    setRerunDialogOpen(true);
  };

  const setBaselineMutation = useMutation({
    mutationFn: async (data: { runId: string; description?: string }) => {
      const response = await fetch(`/api/runs/${data.runId}/set-baseline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: data.description }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to set baseline");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      setBaselineDialogOpen(false);
      toast({
        title: "Success",
        description: "Baseline set successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set baseline",
        variant: "destructive",
      });
    },
  });

  const evaluatePoliciesMutation = useMutation({
    mutationFn: async (runId: string) => {
      const response = await fetch(`/api/runs/${runId}/evaluate-policies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to evaluate policies");
      }
      
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      setPolicyTestDialogOpen(false);
      toast({
        title: "Policy Evaluation Complete",
        description: `Result: ${result?.decision || 'unknown'} ${result?.score ? `(Score: ${result.score.toFixed(2)})` : ''}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to evaluate policies",
        variant: "destructive",
      });
    },
  });

  const handleSetBaseline = (runId: string) => {
    setSelectedRunId(runId);
    setBaselineDialogOpen(true);
  };

  const handleTestPolicies = (runId: string) => {
    setSelectedRunId(runId);
    setPolicyTestDialogOpen(true);
  };

  const handleViewDetails = (runId: string) => {
    setLocation(`/runs/${runId}`);
  };

  const handleSubmitBaseline = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (selectedRunId) {
      setBaselineMutation.mutate({
        runId: selectedRunId,
        description: formData.get("description") as string,
      });
    }
  };

  const handleSubmitPolicyTest = () => {
    if (selectedRunId) {
      evaluatePoliciesMutation.mutate(selectedRunId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'pass':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'warn':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'fail':
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
        <header className="bg-card border-b border-border px-4 sm:px-6 py-4 sticky top-0 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-12 md:pt-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold" data-testid="text-runs-title">Evaluation Runs</h1>
              <p className="text-muted-foreground text-sm sm:text-base">Monitor and analyze evaluation execution results</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search runs..." 
                  className="pl-10 w-full sm:w-64"
                  data-testid="input-search-runs"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" data-testid="button-filter-runs" className="flex-1 sm:flex-none">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-new-run" className="flex-1 sm:flex-none">
                    <Zap className="w-4 h-4 mr-2" />
                    New Run
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Run</DialogTitle>
                    <DialogDescription>
                      Execute an evaluation spec against a policy
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleCreateRun)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Support Quality Test - Run 1"
                                data-testid="input-run-name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                placeholder="Manual evaluation run"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createRunMutation.isPending}>
                          {createRunMutation.isPending ? "Creating..." : "Create Run"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              </div>
            </div>
          </div>
        </header>
        
        <div className="p-4 sm:p-6">
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-4">
            {runs?.length ? (
              runs.map((run: any) => (
                <Card key={run.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          run.status === 'completed' ? 'bg-green-500' :
                          run.status === 'running' ? 'bg-blue-500' :
                          run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}></div>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm" data-testid={`text-run-name-${run.id}`}>{run.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{run.id.slice(0, 8)}</span>
                        </div>
                        {run.isBaseline && (
                          <Badge variant="outline" className="text-xs">
                            <Baseline className="w-3 h-3 mr-1" />
                            Baseline
                          </Badge>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(run.id)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetBaseline(run.id)}>
                            <Target className="w-4 h-4 mr-2" />
                            Set as Baseline
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTestPolicies(run.id)}>
                            <TestTube className="w-4 h-4 mr-2" />
                            Test Policies
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    {run.description && (
                      <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                        {run.description}
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        {run.status === 'failed' && run.errorMessage ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge className={`${getStatusColor(run.status)} border-0 ml-2 cursor-help`}>
                                  {run.status.toUpperCase()}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div>
                                  <p className="font-medium">Error Details:</p>
                                  <p className="text-sm">{run.errorMessage}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge className={`${getStatusColor(run.status)} border-0 ml-2`}>
                            {run.status.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Decision:</span>
                        {run.decision ? (
                          <Badge className={`${getDecisionColor(run.decision)} border-0 ml-2`}>
                            {run.decision.toUpperCase()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground ml-2">-</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="ml-2 font-mono">
                          {run.cost ? `$${run.cost.toFixed(4)}` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="ml-2">
                          {run.duration ? `${Math.floor(run.duration / 60)}m ${run.duration % 60}s` : '-'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      <span>Eval Spec: {run.evalSpecId.slice(0, 8)}</span>
                      <br />
                      <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8">
                <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No runs found</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>Run your first evaluation</Button>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Run ID</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Eval Spec</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Decision</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Cost</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Duration</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Started</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs?.length ? (
                    runs.map((run: any) => (
                      <tr key={run.id} className="hover:bg-muted/25">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              run.status === 'completed' ? 'bg-green-500' :
                              run.status === 'running' ? 'bg-blue-500' :
                              run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                            }`}></div>
                            <span className="font-medium" data-testid={`text-run-name-${run.id}`}>
                              {run.name}
                            </span>
                            {run.isBaseline && (
                              <Badge variant="outline" className="text-xs">
                                <Baseline className="w-3 h-3 mr-1" />
                                Baseline
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-mono text-sm" data-testid={`text-run-id-${run.id}`}>
                            {run.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-medium">Eval Spec {run.evalSpecId.slice(0, 8)}</p>
                            {run.description ? (
                              <p className="text-sm text-muted-foreground">{run.description}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Details from eval spec</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {run.status === 'failed' && run.errorMessage ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge 
                                    className={`${getStatusColor(run.status)} border-0 cursor-help`}
                                    data-testid={`badge-status-${run.id}`}
                                  >
                                    {run.status.toUpperCase()}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div>
                                    <p className="font-medium">Error Details:</p>
                                    <p className="text-sm">{run.errorMessage}</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge 
                              className={`${getStatusColor(run.status)} border-0`}
                              data-testid={`badge-status-${run.id}`}
                            >
                              {run.status.toUpperCase()}
                            </Badge>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {run.decision ? (
                            <Badge 
                              className={`${getDecisionColor(run.decision)} border-0`}
                              data-testid={`badge-decision-${run.id}`}
                            >
                              {run.decision.toUpperCase()}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-mono text-sm">
                            {run.cost ? `$${run.cost.toFixed(4)}` : '-'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm">
                            {run.duration ? `${Math.floor(run.duration / 60)}m ${run.duration % 60}s` : '-'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`button-actions-${run.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleViewDetails(run.id)}
                                data-testid={`button-view-details-${run.id}`}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleRerun(run.id)}
                                data-testid={`button-rerun-${run.id}`}
                              >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Rerun Evaluation
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleSetBaseline(run.id)}
                                data-testid={`button-set-baseline-${run.id}`}
                              >
                                <Target className="w-4 h-4 mr-2" />
                                Set as Baseline
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleTestPolicies(run.id)}
                                data-testid={`button-test-policies-${run.id}`}
                              >
                                <TestTube className="w-4 h-4 mr-2" />
                                Test Policies
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center">
                        <div className="text-center">
                          <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No runs found</p>
                          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                            <DialogTrigger asChild>
                              <Button className="mt-4" data-testid="button-create-first-run">
                                Run your first evaluation
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Create New Run</DialogTitle>
                                <DialogDescription>
                                  Execute an evaluation spec against a policy
                                </DialogDescription>
                              </DialogHeader>
                              <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleCreateRun)} className="space-y-4">
                                  <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Name</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Support Quality Test - Run 1"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
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
                                            placeholder="Manual evaluation run"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <div className="flex justify-end gap-3">
                                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                                      Cancel
                                    </Button>
                                    <Button type="submit" disabled={createRunMutation.isPending}>
                                      {createRunMutation.isPending ? "Creating..." : "Create Run"}
                                    </Button>
                                  </div>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
              <form onSubmit={form.handleSubmit(handleCreateRun)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rerun - Support Quality Test"
                          data-testid="input-rerun-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

        {/* Baseline Dialog */}
        <Dialog open={baselineDialogOpen} onOpenChange={setBaselineDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Set as Baseline</DialogTitle>
              <DialogDescription>
                This run will be used as the baseline for comparison in future evaluations
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitBaseline} className="space-y-4">
              <div>
                <Label htmlFor="baselineDescription">Description (optional)</Label>
                <Input
                  id="baselineDescription"
                  name="description"
                  placeholder="Baseline for quality evaluation..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setBaselineDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={setBaselineMutation.isPending}>
                  {setBaselineMutation.isPending ? "Setting..." : "Set Baseline"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Policy Test Dialog */}
        <Dialog open={policyTestDialogOpen} onOpenChange={setPolicyTestDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Test Policies</DialogTitle>
              <DialogDescription>
                Evaluate this run against all configured policies to see if it passes quality gates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/30 p-4 rounded-md">
                <h4 className="font-medium text-sm mb-2">What will be tested:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Quality thresholds (pass/warn levels)</li>
                  <li>• Cost limits and performance SLOs</li>
                  <li>• Baseline regression detection</li>
                  <li>• Overall policy compliance</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPolicyTestDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitPolicyTest}
                  disabled={evaluatePoliciesMutation.isPending}
                >
                  {evaluatePoliciesMutation.isPending ? "Evaluating..." : "Run Policy Test"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Run Details Modal */}
        <RunDetailsModal 
          runId={detailsRunId}
          open={runDetailsOpen}
          onOpenChange={setRunDetailsOpen}
        />
      </main>
    </div>
  );
}
