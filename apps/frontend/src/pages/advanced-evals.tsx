import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/layout/sidebar";
import { 
  Play, 
  Zap, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Settings,
  Activity,
  TrendingUp,
  AlertTriangle,
  Cpu,
  Code,
  Target
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PythonWorkerStatus {
  healthy: boolean;
  info?: any;
  endpoint: string;
  error?: string;
}

interface EvaluationTask {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  results?: any;
  error?: string;
  created_at: string;
  updated_at: string;
}

interface EvalSpec {
  id: string;
  name: string;
  description: string;
  modelProvider?: string;
  modelName?: string;
}

export default function AdvancedEvals() {
  const [selectedEvalSpec, setSelectedEvalSpec] = useState<string>("");
  const [selectedEvalType, setSelectedEvalType] = useState<string>("model_graded");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Python worker status
  const { data: workerStatus, isLoading: workerStatusLoading } = useQuery<PythonWorkerStatus>({
    queryKey: ["/api/python-worker/status"],
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Evaluation specs
  const { data: evalSpecs = [], isLoading: evalSpecsLoading } = useQuery<EvalSpec[]>({
    queryKey: ["/api/eval-specs"],
  });

  // Active evaluation tasks
  const { data: activeTasks = [], isLoading: tasksLoading } = useQuery<EvaluationTask[]>({
    queryKey: ["/api/evaluations/advanced"],
    refetchInterval: 2000, // Refresh every 2 seconds for real-time updates
  });

  const submitEvaluationMutation = useMutation({
    mutationFn: async ({ evalSpecId, useAdvancedEvals, evaluationType }: {
      evalSpecId: string;
      useAdvancedEvals: boolean;
      evaluationType: string;
    }) => {
      const response = await apiRequest("POST", "/api/runs/advanced", {
        evalSpecId,
        useAdvancedEvals,
        evaluationType
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/evaluations/advanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      
      if (data.pythonTaskId) {
        toast({
          title: "Advanced Evaluation Started",
          description: `OpenAI Evals evaluation submitted. Task ID: ${data.pythonTaskId}`,
        });
      } else {
        toast({
          title: "Standard Evaluation Started",
          description: "Evaluation is running with the standard engine.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Evaluation Failed",
        description: error.message || "Failed to start evaluation",
        variant: "destructive",
      });
    },
  });

  const handleStartEvaluation = () => {
    if (!selectedEvalSpec) {
      toast({
        title: "Selection Required",
        description: "Please select an evaluation specification",
        variant: "destructive",
      });
      return;
    }

    submitEvaluationMutation.mutate({
      evalSpecId: selectedEvalSpec,
      useAdvancedEvals: true,
      evaluationType: selectedEvalType
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'running': return 'secondary';
      case 'pending': return 'outline';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'running': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const isWorkerHealthy = workerStatus?.healthy;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-advanced-evals-title">
                <Zap className="w-6 h-6 text-yellow-500" />
                OpenAI Evals Integration
              </h1>
              <p className="text-muted-foreground">Advanced LLM evaluations powered by OpenAI's proven framework</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isWorkerHealthy ? "default" : "destructive"} data-testid="badge-worker-status">
                <Cpu className="w-3 h-3 mr-1" />
                Python Worker: {isWorkerHealthy ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Worker Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Python Worker Status
              </CardTitle>
              <CardDescription>
                OpenAI Evals Python worker service status and configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workerStatusLoading ? (
                <div className="text-center py-4">Loading worker status...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${isWorkerHealthy ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <div>
                        <div className="font-medium">
                          {isWorkerHealthy ? 'Service Online' : 'Service Offline'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Endpoint: {workerStatus?.endpoint || 'http://localhost:8000'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={isWorkerHealthy ? "default" : "destructive"}>
                      {isWorkerHealthy ? "Ready" : "Unavailable"}
                    </Badge>
                  </div>
                  
                  {!isWorkerHealthy && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Python worker is not running. Start it with: <code className="bg-muted px-1 rounded">cd python_worker && python main.py</code>
                        <br />
                        {workerStatus?.error && <span className="text-destructive">Error: {workerStatus.error}</span>}
                      </AlertDescription>
                    </Alert>
                  )}

                  {isWorkerHealthy && workerStatus?.info && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <div className="text-sm font-medium">Service Version</div>
                        <div className="text-sm text-muted-foreground">{workerStatus.info.service}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">OpenAI API</div>
                        <div className="text-sm text-muted-foreground">
                          {workerStatus.info.openai_configured ? "✓ Configured" : "✗ Not configured"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evaluation Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Advanced Evaluation Controls
              </CardTitle>
              <CardDescription>
                Run evaluations using OpenAI's Evals framework with model grading, exact match, and similarity scoring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Evaluation Specification</label>
                  <Select value={selectedEvalSpec} onValueChange={setSelectedEvalSpec}>
                    <SelectTrigger data-testid="select-eval-spec">
                      <SelectValue placeholder="Choose eval spec" />
                    </SelectTrigger>
                    <SelectContent>
                      {evalSpecs.map((spec: EvalSpec) => (
                        <SelectItem key={spec.id} value={spec.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{spec.name}</span>
                            <span className="text-xs text-muted-foreground">{spec.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Evaluation Type</label>
                  <Select value={selectedEvalType} onValueChange={setSelectedEvalType}>
                    <SelectTrigger data-testid="select-eval-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="model_graded">
                        <div className="flex flex-col">
                          <span className="font-medium">Model Graded</span>
                          <span className="text-xs text-muted-foreground">GPT-4 as judge evaluation</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="exact_match">
                        <div className="flex flex-col">
                          <span className="font-medium">Exact Match</span>
                          <span className="text-xs text-muted-foreground">String comparison</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="similarity">
                        <div className="flex flex-col">
                          <span className="font-medium">Semantic Similarity</span>
                          <span className="text-xs text-muted-foreground">Embedding-based scoring</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleStartEvaluation}
                    disabled={!selectedEvalSpec || !isWorkerHealthy || submitEvaluationMutation.isPending}
                    className="w-full"
                    data-testid="button-start-evaluation"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {submitEvaluationMutation.isPending ? "Starting..." : "Start Advanced Evaluation"}
                  </Button>
                </div>
              </div>

              {!isWorkerHealthy && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Python worker must be running to use advanced evaluations. The system will fall back to standard evaluation if the worker is unavailable.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Active Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Active Evaluation Tasks
              </CardTitle>
              <CardDescription>
                Real-time status of OpenAI Evals evaluations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="text-center py-4">Loading evaluation tasks...</div>
              ) : activeTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No active evaluation tasks</p>
                  <p className="text-sm">Start an advanced evaluation to see tasks here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeTasks.slice(0, 10).map((task: EvaluationTask) => (
                    <div key={task.task_id} className="border rounded-lg p-4" data-testid={`task-${task.task_id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(task.status)}
                          <div>
                            <div className="font-medium">Task {task.task_id.slice(0, 8)}</div>
                            <div className="text-sm text-muted-foreground">
                              Started: {formatDateTime(task.created_at)}
                            </div>
                          </div>
                        </div>
                        <Badge variant={getStatusColor(task.status)}>
                          {task.status.toUpperCase()}
                        </Badge>
                      </div>

                      {task.status === 'running' && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>Progress</span>
                            <span>{Math.round(task.progress * 100)}%</span>
                          </div>
                          <Progress value={task.progress * 100} className="h-2" />
                        </div>
                      )}

                      {task.status === 'completed' && task.results && (
                        <div className="mt-3 p-3 bg-muted rounded-md">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="font-medium">Total Samples</div>
                              <div>{task.results.total_samples || 'N/A'}</div>
                            </div>
                            <div>
                              <div className="font-medium">Pass Rate</div>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-600" />
                                {((task.results.pass_rate || task.results.accuracy || 0) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {task.status === 'failed' && task.error && (
                        <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                          <div className="text-sm text-destructive">
                            <div className="font-medium">Error:</div>
                            <div>{task.error}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>OpenAI Evals Framework</CardTitle>
              <CardDescription>
                What makes this integration powerful
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Advanced Evaluation Types</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>Model Graded:</strong> GPT-4 as judge with custom criteria</li>
                    <li>• <strong>Exact Match:</strong> Deterministic string comparison</li>
                    <li>• <strong>Similarity:</strong> Semantic embedding-based scoring</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">OpenAI's Proven Framework</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Battle-tested evaluation methods</li>
                    <li>• Statistical rigor and reproducibility</li>
                    <li>• Rich ecosystem of evaluation templates</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}