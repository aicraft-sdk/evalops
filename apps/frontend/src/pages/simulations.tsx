import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Play, Edit, Trash, Bot, FileText, ChevronRight, ChevronDown, Code } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

const DEFAULT_SCENARIO_DEFINITION = {
  turns: [
    {
      userMessage: "Hello, I need help with my account.",
      responseValidation: {
        type: "schema",
        schema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
  ],
  terminationRules: {
    maxTurns: 10,
    stopTokens: ["goodbye", "thank you"],
    judgeVerdictThreshold: 0.8,
  },
  agentId: "",
};

export default function Simulations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateSuiteDialogOpen, setIsCreateSuiteDialogOpen] = useState(false);
  const [isCreateScenarioDialogOpen, setIsCreateScenarioDialogOpen] = useState(false);
  const [isEditScenarioDialogOpen, setIsEditScenarioDialogOpen] = useState(false);
  const [selectedSuite, setSelectedSuite] = useState<any>(null);
  const [selectedScenario, setSelectedScenario] = useState<any>(null);
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [scenarioDefinition, setScenarioDefinition] = useState(JSON.stringify(DEFAULT_SCENARIO_DEFINITION, null, 2));
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");

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

  const { data: suites, isLoading: suitesLoading } = useQuery<any[]>({
    queryKey: ["/api/simulations/suites"],
    enabled: isAuthenticated,
  });

  // Fetch scenarios for the selected suite when it's expanded
  const { data: scenarios } = useQuery<any[]>({
    queryKey: ["/api/simulations/suites", selectedSuite?.id, "scenarios"],
    enabled: isAuthenticated && !!selectedSuite?.id && expandedSuites.has(selectedSuite.id),
  });

  const { data: agents } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    enabled: isAuthenticated && (isCreateScenarioDialogOpen || isEditScenarioDialogOpen),
  });

  const createSuiteMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/simulations/suites", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/suites"] });
      setIsCreateSuiteDialogOpen(false);
      toast({
        title: "Suite created",
        description: "Your simulation suite has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create suite",
        variant: "destructive",
      });
    },
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/simulations/suites/${data.suiteId}/scenarios`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/scenarios"] });
      setIsCreateScenarioDialogOpen(false);
      setScenarioName("");
      setScenarioDescription("");
      setScenarioDefinition(JSON.stringify(DEFAULT_SCENARIO_DEFINITION, null, 2));
      toast({
        title: "Scenario created",
        description: "Your scenario has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create scenario",
        variant: "destructive",
      });
    },
  });

  const updateScenarioMutation = useMutation({
    mutationFn: async ({ scenarioId, data }: { scenarioId: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/simulations/scenarios/${scenarioId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/scenarios"] });
      setIsEditScenarioDialogOpen(false);
      setSelectedScenario(null);
      toast({
        title: "Scenario updated",
        description: "Your scenario has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update scenario",
        variant: "destructive",
      });
    },
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      const response = await apiRequest("DELETE", `/api/simulations/scenarios/${scenarioId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/scenarios"] });
      toast({
        title: "Scenario deleted",
        description: "Scenario has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete scenario",
        variant: "destructive",
      });
    },
  });

  const deleteSuiteMutation = useMutation({
    mutationFn: async (suiteId: string) => {
      const response = await apiRequest("DELETE", `/api/simulations/suites/${suiteId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/suites"] });
      toast({
        title: "Suite deleted",
        description: "Suite has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete suite",
        variant: "destructive",
      });
    },
  });

  const runScenarioMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      const response = await apiRequest("POST", `/api/simulations/scenarios/${scenarioId}/run`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Simulation started",
        description: "Simulation run has been started successfully.",
      });
      // Navigate to run details
      if (data?.runId) {
        window.location.href = `/runs/${data.runId}`;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start simulation",
        variant: "destructive",
      });
    },
  });

  const handleCreateSuite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createSuiteMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      config: {},
    });
  };

  const handleCreateScenario = () => {
    if (!selectedSuite?.id) {
      toast({
        title: "Error",
        description: "Please select a suite first",
        variant: "destructive",
      });
      return;
    }

    let definition;
    try {
      definition = JSON.parse(scenarioDefinition);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please provide valid JSON for the scenario definition.",
        variant: "destructive",
      });
      return;
    }

    createScenarioMutation.mutate({
      suiteId: selectedSuite.id,
      name: scenarioName,
      description: scenarioDescription,
      definition,
    });
  };

  const handleUpdateScenario = () => {
    if (!selectedScenario?.id) return;

    let definition;
    try {
      definition = JSON.parse(scenarioDefinition);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please provide valid JSON for the scenario definition.",
        variant: "destructive",
      });
      return;
    }

    updateScenarioMutation.mutate({
      scenarioId: selectedScenario.id,
      data: {
        name: scenarioName,
        description: scenarioDescription,
        definition,
      },
    });
  };

  const toggleSuiteExpansion = (suiteId: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(suiteId)) {
        next.delete(suiteId);
      } else {
        next.add(suiteId);
      }
      return next;
    });
  };

  const filteredSuites = suites?.filter((suite) =>
    searchTerm === "" ||
    suite.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    suite.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

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
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Bot className="h-6 w-6" />
                Simulations
              </h1>
              <p className="text-muted-foreground">Manage simulation suites and scenarios</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search suites..." 
                  className="pl-10 w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Dialog open={isCreateSuiteDialogOpen} onOpenChange={setIsCreateSuiteDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Suite
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Simulation Suite</DialogTitle>
                    <DialogDescription>
                      Create a new simulation suite to organize your scenarios.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateSuite} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Customer Support Simulation"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Simulations for testing customer support agents"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsCreateSuiteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createSuiteMutation.isPending}>
                        {createSuiteMutation.isPending ? "Creating..." : "Create Suite"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <div className="p-6">
          {suitesLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : filteredSuites.length > 0 ? (
            <div className="space-y-4">
              {filteredSuites.map((suite) => {
                const isExpanded = expandedSuites.has(suite.id);
                // Show scenarios only for the selected suite when expanded
                const suiteScenarios = (selectedSuite?.id === suite.id && scenarios) ? scenarios : [];
                
                return (
                  <Card key={suite.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              onClick={() => {
                                if (!isExpanded) {
                                  setSelectedSuite(suite);
                                }
                                toggleSuiteExpansion(suite.id);
                              }}
                              className="flex items-center gap-2 hover:text-foreground transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <CardTitle className="text-lg">{suite.name}</CardTitle>
                            </button>
                          </div>
                          <p className="text-sm text-muted-foreground">{suite.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{suiteScenarios.length} scenarios</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedSuite(suite);
                              setIsCreateScenarioDialogOpen(true);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add Scenario
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete suite "${suite.name}"? This will also delete all scenarios in this suite.`)) {
                                deleteSuiteMutation.mutate(suite.id);
                              }
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent>
                        {suiteScenarios.length > 0 ? (
                          <div className="space-y-3">
                            {suiteScenarios.map((scenario: any) => (
                              <Card key={scenario.id} className="bg-muted/50">
                                <CardHeader className="pb-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <CardTitle className="text-base">{scenario.name}</CardTitle>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {scenario.description || "No description"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => runScenarioMutation.mutate(scenario.id)}
                                        disabled={runScenarioMutation.isPending}
                                      >
                                        <Play className="w-4 h-4 mr-1" />
                                        Run
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedScenario(scenario);
                                          setScenarioName(scenario.name);
                                          setScenarioDescription(scenario.description || "");
                                          setScenarioDefinition(JSON.stringify(scenario.definition || {}, null, 2));
                                          setIsEditScenarioDialogOpen(true);
                                        }}
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          if (confirm(`Delete scenario "${scenario.name}"?`)) {
                                            deleteScenarioMutation.mutate(scenario.id);
                                          }
                                        }}
                                      >
                                        <Trash className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No scenarios yet</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-4"
                              onClick={() => {
                                setSelectedSuite(suite);
                                setIsCreateScenarioDialogOpen(true);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Create First Scenario
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">No simulation suites yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first simulation suite</p>
              <Button onClick={() => setIsCreateSuiteDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Suite
              </Button>
            </div>
          )}
        </div>

        {/* Create Scenario Dialog */}
        <Dialog open={isCreateScenarioDialogOpen} onOpenChange={setIsCreateScenarioDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Create New Scenario</DialogTitle>
              <DialogDescription>
                Define a simulation scenario with turns, validation rules, and termination conditions.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4 p-1">
              <div>
                <Label htmlFor="scenario-name">Name</Label>
                <Input
                  id="scenario-name"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="Customer Support - Password Reset"
                  required
                />
              </div>
              <div>
                <Label htmlFor="scenario-description">Description</Label>
                <Textarea
                  id="scenario-description"
                  value={scenarioDescription}
                  onChange={(e) => setScenarioDescription(e.target.value)}
                  placeholder="Test customer support agent handling password reset requests"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="scenario-definition">Scenario Definition (JSON)</Label>
                  <Badge variant="outline" className="text-xs">
                    <Code className="w-3 h-3 mr-1" />
                    JSON
                  </Badge>
                </div>
                <Textarea
                  id="scenario-definition"
                  value={scenarioDefinition}
                  onChange={(e) => setScenarioDefinition(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder={JSON.stringify(DEFAULT_SCENARIO_DEFINITION, null, 2)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setIsCreateScenarioDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateScenario} disabled={createScenarioMutation.isPending}>
                  {createScenarioMutation.isPending ? "Creating..." : "Create Scenario"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Scenario Dialog */}
        <Dialog open={isEditScenarioDialogOpen} onOpenChange={setIsEditScenarioDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Scenario</DialogTitle>
              <DialogDescription>
                Update scenario definition, validation rules, and termination conditions.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4 p-1">
              <div>
                <Label htmlFor="edit-scenario-name">Name</Label>
                <Input
                  id="edit-scenario-name"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="Customer Support - Password Reset"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-scenario-description">Description</Label>
                <Textarea
                  id="edit-scenario-description"
                  value={scenarioDescription}
                  onChange={(e) => setScenarioDescription(e.target.value)}
                  placeholder="Test customer support agent handling password reset requests"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="edit-scenario-definition">Scenario Definition (JSON)</Label>
                  <Badge variant="outline" className="text-xs">
                    <Code className="w-3 h-3 mr-1" />
                    JSON
                  </Badge>
                </div>
                <Textarea
                  id="edit-scenario-definition"
                  value={scenarioDefinition}
                  onChange={(e) => setScenarioDefinition(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setIsEditScenarioDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateScenario} disabled={updateScenarioMutation.isPending}>
                  {updateScenarioMutation.isPending ? "Updating..." : "Update Scenario"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
