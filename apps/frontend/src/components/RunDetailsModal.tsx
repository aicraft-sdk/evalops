import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  DollarSign, 
  Clock, 
  CheckCircle,
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Target,
  Baseline,
  TrendingUp,
  TrendingDown
} from "lucide-react";

interface RunDetailsModalProps {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetricStat {
  mean: number;
  std?: number;
}

interface RunMetrics {
  cost?: MetricStat;
  latencyP50?: number;
  exactMatch?: MetricStat;
  [key: string]: MetricStat | number | undefined;
}

interface SampleEvaluationResults {
  cost?: number;
  latency?: number;
  [evaluator: string]: number | undefined;
}

interface SampleResult {
  sampleIndex: number;
  repetition: number;
  input: unknown;
  actualOutput: unknown;
  expectedOutput?: unknown;
  evaluationResults?: SampleEvaluationResults;
}

interface RunDetails {
  status?: string;
  decision?: string;
  isBaseline?: boolean;
  cost?: number;
  duration?: number;
  metrics?: RunMetrics;
  evalSpecId?: string;
  policyId?: string;
  startedAt?: string;
  triggeredBy?: string;
  sampleResults?: SampleResult[];
}

interface PolicyViolation {
  message: string;
  policyName: string;
  severity: string;
}

interface PolicyRuleWarning {
  message?: string;
}

interface PolicyResultsSummary {
  violations?: PolicyViolation[];
  warnings?: PolicyRuleWarning[];
  passedRules?: string[];
  score?: number;
}

interface PolicyCheckResult {
  passed?: boolean;
  warnings?: PolicyRuleWarning[];
}

type PolicyResults = PolicyResultsSummary | PolicyCheckResult[];

interface BaselineRunSummary {
  createdAt: string;
  description?: string;
  decision?: string;
  cost?: number;
  duration?: number;
  metrics?: RunMetrics;
}

interface BaselineComparison {
  hasBaseline?: boolean;
  baseline: BaselineRunSummary;
  current: BaselineRunSummary;
  comparison?: {
    overallChange?: 'improved' | 'degraded' | 'stable' | string;
  };
  improvements: {
    costChange: number | null;
    durationChange: number | null;
  };
}

export function RunDetailsModal({ runId, open, onOpenChange }: RunDetailsModalProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  const { data: runDetails, isLoading } = useQuery<RunDetails>({
    queryKey: ["/api/runs", runId, "details"],
    enabled: !!runId && open,
  });

  const { data: policyResults } = useQuery<PolicyResults>({
    queryKey: ["/api/runs", runId, "policy-results"],
    enabled: !!runId && open,
  });

  const { data: baselineComparison } = useQuery<BaselineComparison>({
    queryKey: ["/api/runs", runId, "baseline-comparison"],
    enabled: !!runId && open,
  });

  if (!runId) return null;

  const formatMetric = (value: any) => {
    if (typeof value === 'object' && value !== null) {
      if ('mean' in value) {
        return `${value.mean.toFixed(3)} ±${value.std?.toFixed(3) || 0}`;
      }
    }
    return typeof value === 'number' ? value.toFixed(3) : String(value);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <Activity className="h-4 w-4 text-blue-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] sm:w-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon(runDetails?.status || 'pending')}
            Run Details: {runId.slice(0, 8)}
            {runDetails?.isBaseline && (
              <Badge variant="outline" className="ml-2">
                <Baseline className="h-3 w-3 mr-1" />
                Baseline
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="w-full">
            {/* Mobile Dropdown Selector */}
            <div className="sm:hidden mb-4">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="samples">Sample Results</SelectItem>
                  <SelectItem value="policies">Policy Results</SelectItem>
                  <SelectItem value="metrics">Raw Metrics</SelectItem>
                  {baselineComparison?.hasBaseline && (
                    <SelectItem value="baseline">Baseline Comparison</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`hidden sm:grid w-full ${baselineComparison?.hasBaseline ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="samples">Sample Results</TabsTrigger>
                <TabsTrigger value="policies">Policy Results</TabsTrigger>
                <TabsTrigger value="metrics">Raw Metrics</TabsTrigger>
                {baselineComparison?.hasBaseline && (
                  <TabsTrigger value="baseline">Baseline</TabsTrigger>
                )}
              </TabsList>

            <ScrollArea className="h-[60vh] w-full">
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        ${runDetails?.cost?.toFixed(4) || '0.0000'}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {runDetails?.metrics?.cost ? formatMetric(runDetails.metrics.cost) : 'No cost data'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Duration</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {runDetails?.duration || 0}s
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Avg latency: {runDetails?.metrics?.latencyP50 ? `${runDetails.metrics.latencyP50}ms` : 'N/A'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Exact Match</CardTitle>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {runDetails?.metrics?.exactMatch?.mean != null 
                          ? `${Math.round(runDetails.metrics.exactMatch.mean * 100)}%` 
                          : 'N/A'}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {runDetails?.metrics?.exactMatch 
                          ? formatMetric(runDetails.metrics.exactMatch)
                          : 'No exact match data'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Decision</CardTitle>
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        <Badge className={
                          runDetails?.decision === 'pass' ? 'bg-green-500' :
                          runDetails?.decision === 'warn' ? 'bg-yellow-500' :
                          runDetails?.decision === 'fail' ? 'bg-red-500' : 'bg-gray-500'
                        }>
                          {runDetails?.decision?.toUpperCase() || 'PENDING'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Based on policy evaluation
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Summary and Insights Section */}
                <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Summary & Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm leading-relaxed space-y-2">
                      {/* Overall Result Summary */}
                      <div>
                        <span className="font-medium">Overall Result: </span>
                        {runDetails?.decision === 'pass' && (
                          <span className="text-green-700 dark:text-green-300">
                            ✅ This evaluation run passed successfully, meeting all quality standards and policy requirements.
                          </span>
                        )}
                        {runDetails?.decision === 'warn' && (
                          <span className="text-yellow-700 dark:text-yellow-300">
                            ⚠️ This evaluation run completed with warnings, indicating some concerns that should be reviewed.
                          </span>
                        )}
                        {runDetails?.decision === 'fail' && (
                          <span className="text-red-700 dark:text-red-300">
                            ❌ This evaluation run failed, indicating significant issues that need to be addressed.
                          </span>
                        )}
                        {!runDetails?.decision && (
                          <span className="text-gray-700 dark:text-gray-300">
                            ⏳ This evaluation is still in progress or pending completion.
                          </span>
                        )}
                      </div>

                      {/* Cost Analysis */}
                      {runDetails?.cost !== undefined && runDetails?.cost !== null && (
                        <div>
                          <span className="font-medium">Cost Analysis: </span>
                          {runDetails.cost < 0.01 ? (
                            <span className="text-green-700 dark:text-green-300">
                              Very cost-effective run (${runDetails.cost.toFixed(4)}), excellent for frequent testing.
                            </span>
                          ) : runDetails.cost < 0.10 ? (
                            <span className="text-blue-700 dark:text-blue-300">
                              Reasonable cost (${runDetails.cost.toFixed(4)}), suitable for regular evaluations.
                            </span>
                          ) : (
                            <span className="text-yellow-700 dark:text-yellow-300">
                              Higher cost (${runDetails.cost.toFixed(4)}), consider optimizing for frequent runs.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Performance Analysis */}
                      {runDetails?.duration !== undefined && runDetails?.duration !== null && (
                        <div>
                          <span className="font-medium">Performance: </span>
                          {runDetails.duration < 30 ? (
                            <span className="text-green-700 dark:text-green-300">
                              Fast completion ({runDetails.duration}s), great for rapid iteration and testing.
                            </span>
                          ) : runDetails.duration < 120 ? (
                            <span className="text-blue-700 dark:text-blue-300">
                              Standard completion time ({runDetails.duration}s), typical for thorough evaluations.
                            </span>
                          ) : (
                            <span className="text-yellow-700 dark:text-yellow-300">
                              Longer evaluation ({runDetails.duration}s), consider optimization for faster feedback.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Baseline Comparison Summary */}
                      {baselineComparison?.hasBaseline && (
                        <div>
                          <span className="font-medium">Baseline Comparison: </span>
                          {baselineComparison.comparison?.overallChange === 'improved' ? (
                            <span className="text-green-700 dark:text-green-300">
                              📈 Performance improved compared to baseline - your changes are having a positive impact.
                            </span>
                          ) : baselineComparison.comparison?.overallChange === 'degraded' ? (
                            <span className="text-red-700 dark:text-red-300">
                              📉 Performance decreased from baseline - review recent changes for potential issues.
                            </span>
                          ) : baselineComparison.comparison?.overallChange === 'stable' ? (
                            <span className="text-blue-700 dark:text-blue-300">
                              📊 Performance remains stable compared to baseline - consistent quality maintained.
                            </span>
                          ) : baselineComparison.baseline && runDetails ? (
                            <>
                              {runDetails.decision === 'pass' && baselineComparison.baseline.decision === 'fail' ? (
                                <span className="text-green-700 dark:text-green-300">
                                  📈 Major improvement - run now passes while baseline failed.
                                </span>
                              ) : runDetails.decision === 'fail' && baselineComparison.baseline.decision === 'pass' ? (
                                <span className="text-red-700 dark:text-red-300">
                                  📉 Significant regression - run failed while baseline passed.
                                </span>
                              ) : runDetails.decision === baselineComparison.baseline.decision ? (
                                <span className="text-blue-700 dark:text-blue-300">
                                  📊 Similar outcome to baseline - see Baseline Comparison tab for detailed metrics.
                                </span>
                              ) : (
                                <span className="text-gray-700 dark:text-gray-300">
                                  📊 Baseline comparison data available in the Baseline Comparison tab for detailed analysis.
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">
                              📊 Baseline comparison data available in the Baseline Comparison tab for detailed analysis.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Policy Insights */}
                      {policyResults && (
                        <div>
                          <span className="font-medium">Policy Evaluation: </span>
                          {typeof policyResults === 'object' && 'violations' in policyResults ? (
                            <>
                              {policyResults.violations && policyResults.violations.length > 0 ? (
                                <span className="text-red-700 dark:text-red-300">
                                  Policy violations found ({policyResults.violations.length}) - review the Policy Results tab for specific issues.
                                </span>
                              ) : policyResults.warnings && policyResults.warnings.length > 0 ? (
                                <span className="text-yellow-700 dark:text-yellow-300">
                                  Policy checks passed with {policyResults.warnings.length} warning(s) - see Policy Results tab for details.
                                </span>
                              ) : policyResults.passedRules && policyResults.passedRules.length > 0 ? (
                                <span className="text-green-700 dark:text-green-300">
                                  All policy checks passed successfully ({policyResults.passedRules.length} rules) - quality standards met.
                                </span>
                              ) : (
                                <span className="text-blue-700 dark:text-blue-300">
                                  Policy evaluation completed - see Policy Results tab for detailed analysis.
                                </span>
                              )}
                            </>
                          ) : Array.isArray(policyResults) && policyResults.length > 0 ? (
                            <>
                              {policyResults.some(p => p.passed === false) ? (
                                <span className="text-red-700 dark:text-red-300">
                                  Some policy checks failed - review the Policy Results tab for specific violations.
                                </span>
                              ) : policyResults.some(p => (p.warnings?.length ?? 0) > 0) ? (
                                <span className="text-yellow-700 dark:text-yellow-300">
                                  Policy checks passed with warnings - see Policy Results tab for details.
                                </span>
                              ) : (
                                <span className="text-green-700 dark:text-green-300">
                                  All policy checks passed successfully - quality standards met.
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">
                              Policy evaluation data will appear here when available.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Run Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Eval Spec</p>
                        <p className="text-sm text-muted-foreground">{runDetails?.evalSpecId?.slice(0, 8)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Policy</p>
                        <p className="text-sm text-muted-foreground">{runDetails?.policyId?.slice(0, 8) || 'None'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Started</p>
                        <p className="text-sm text-muted-foreground">
                          {runDetails?.startedAt ? new Date(runDetails.startedAt).toLocaleString() : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Triggered By</p>
                        <p className="text-sm text-muted-foreground">{runDetails?.triggeredBy || 'Unknown'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="samples" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Sample Evaluation Results</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Individual inputs, AI responses, and evaluation scores
                    </p>
                  </CardHeader>
                  <CardContent>
                    {runDetails?.sampleResults?.length ? (
                      <div className="space-y-4">
                        {runDetails.sampleResults.map((sample: any, index: number) => {
                          const evalResults = sample.evaluationResults || {};
                          const renderEvaluatorScore = (evaluator: string, score: number) => {
                            const scoreValue = typeof score === 'number' ? score : 0;
                            const scorePercentage = Math.round(scoreValue * 100);
                            const badgeVariant = scoreValue >= 0.8 ? 'default' : scoreValue >= 0.5 ? 'secondary' : 'destructive';
                            
                            return (
                              <div key={evaluator} className="flex items-center gap-2">
                                <span className="text-sm font-medium min-w-[120px]">{evaluator}:</span>
                                <Badge variant={badgeVariant} className="text-xs">
                                  {scorePercentage}%
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  ({scoreValue.toFixed(3)})
                                </span>
                              </div>
                            );
                          };

                          return (
                            <Card key={index} className="border-l-4 border-l-blue-500">
                              <CardContent className="pt-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-semibold text-muted-foreground">
                                      Sample {sample.sampleIndex + 1} {sample.repetition > 0 && `(Rep ${sample.repetition + 1})`}
                                    </p>
                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                      {evalResults.cost && (
                                        <span>Cost: ${evalResults.cost.toFixed(4)}</span>
                                      )}
                                      {evalResults.latency && (
                                        <span>Latency: {evalResults.latency}ms</span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-sm font-medium">Input:</p>
                                    <p className="text-sm bg-muted p-2 rounded font-mono text-xs">
                                      {typeof sample.input === 'string' ? sample.input : JSON.stringify(sample.input, null, 2)}
                                    </p>
                                  </div>
                                  
                                  <div>
                                    <p className="text-sm font-medium">AI Response:</p>
                                    <p className="text-sm bg-muted p-2 rounded text-xs">
                                      {typeof sample.actualOutput === 'string' ? sample.actualOutput : JSON.stringify(sample.actualOutput, null, 2)}
                                    </p>
                                  </div>
                                  
                                  {sample.expectedOutput && (
                                    <div>
                                      <p className="text-sm font-medium">Expected Output:</p>
                                      <p className="text-sm bg-muted p-2 rounded text-xs">
                                        {typeof sample.expectedOutput === 'string' ? sample.expectedOutput : JSON.stringify(sample.expectedOutput, null, 2)}
                                      </p>
                                    </div>
                                  )}

                                  {Object.keys(evalResults).length > 0 && (
                                    <div className="pt-2 border-t">
                                      <p className="text-sm font-medium mb-2">Evaluator Scores:</p>
                                      <div className="space-y-2">
                                        {Object.entries(evalResults).map(([evaluator, score]) => {
                                          if (evaluator === 'cost' || evaluator === 'latency') return null;
                                          if (typeof score === 'number') {
                                            return renderEvaluatorScore(evaluator, score);
                                          }
                                          return null;
                                        })}
                                        {Object.keys(evalResults).filter(k => k !== 'cost' && k !== 'latency' && typeof evalResults[k] === 'number').length === 0 && (
                                          <p className="text-xs text-muted-foreground">No evaluator scores recorded</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No sample data available for this run</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="policies" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Policy Evaluation Results</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Detailed policy rule evaluation and violations
                    </p>
                  </CardHeader>
                  <CardContent>
                    {policyResults && !Array.isArray(policyResults) ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-500">{policyResults.passedRules || 0}</p>
                            <p className="text-sm text-muted-foreground">Passed Rules</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-red-500">{policyResults.violations?.length || 0}</p>
                            <p className="text-sm text-muted-foreground">Violations</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold">{policyResults.score || 0}%</p>
                            <p className="text-sm text-muted-foreground">Quality Score</p>
                          </div>
                        </div>

                        {policyResults.violations && policyResults.violations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="font-medium">Policy Violations:</h4>
                            {policyResults.violations.map((violation: PolicyViolation, index: number) => (
                              <Card key={index} className="border-l-4 border-l-red-500">
                                <CardContent className="pt-4">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-medium">{violation.message}</p>
                                      <p className="text-sm text-muted-foreground">Policy: {violation.policyName}</p>
                                    </div>
                                    <Badge variant={violation.severity === 'error' ? 'destructive' : 'secondary'}>
                                      {violation.severity}
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No policy results available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="metrics" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Raw Metrics Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-4 rounded overflow-auto">
                      {JSON.stringify(runDetails?.metrics, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              {baselineComparison?.hasBaseline && (
                <TabsContent value="baseline" className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Baseline Run
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          Created: {new Date(baselineComparison.baseline.createdAt).toLocaleString()}
                        </div>
                        {baselineComparison.baseline.description && (
                          <div className="text-sm">
                            <strong>Description:</strong> {baselineComparison.baseline.description}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Decision:</span>
                            <Badge variant={baselineComparison.baseline.decision === 'pass' ? 'default' : 
                                           baselineComparison.baseline.decision === 'warn' ? 'secondary' : 'destructive'} 
                                   className="ml-2">
                              {baselineComparison.baseline.decision || 'N/A'}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cost:</span>
                            <span className="ml-2">${(baselineComparison.baseline.cost || 0).toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="ml-2">{baselineComparison.baseline.duration || 0}s</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Current Run
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          Created: {new Date(baselineComparison.current.createdAt).toLocaleString()}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Decision:</span>
                            <Badge variant={baselineComparison.current.decision === 'pass' ? 'default' : 
                                           baselineComparison.current.decision === 'warn' ? 'secondary' : 'destructive'} 
                                   className="ml-2">
                              {baselineComparison.current.decision || 'N/A'}
                            </Badge>
                          </div>
                          <div className="flex items-center">
                            <span className="text-muted-foreground">Cost:</span>
                            <span className="ml-2">${(baselineComparison.current.cost || 0).toFixed(4)}</span>
                            {baselineComparison.improvements.costChange !== null && (
                              <Badge variant={baselineComparison.improvements.costChange < 0 ? 'default' : 'destructive'} 
                                     className="ml-2 text-xs">
                                {baselineComparison.improvements.costChange < 0 ? (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                )}
                                {Math.abs(baselineComparison.improvements.costChange).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="ml-2">{baselineComparison.current.duration || 0}s</span>
                            {baselineComparison.improvements.durationChange !== null && (
                              <Badge variant={baselineComparison.improvements.durationChange < 0 ? 'default' : 'destructive'} 
                                     className="ml-2 text-xs">
                                {baselineComparison.improvements.durationChange < 0 ? (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                )}
                                {Math.abs(baselineComparison.improvements.durationChange).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Performance Metrics Comparison */}
                  {baselineComparison.baseline.metrics && baselineComparison.current.metrics && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Performance Metrics Comparison</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(baselineComparison.baseline.metrics).map(([key, baselineValue]) => {
                            const currentValue = baselineComparison.current.metrics?.[key];
                            if (typeof baselineValue !== 'object' || typeof currentValue !== 'object') return null;
                            
                            const baselineMean = baselineValue.mean || 0;
                            const currentMean = currentValue.mean || 0;
                            const change = baselineMean ? ((currentMean - baselineMean) / baselineMean * 100) : 0;
                            
                            return (
                              <div key={key} className="p-3 border rounded">
                                <div className="font-medium text-sm mb-2 capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Baseline:</span>
                                    <div className="font-mono">{baselineMean.toFixed(3)}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Current:</span>
                                    <div className="font-mono flex items-center gap-1">
                                      {currentMean.toFixed(3)}
                                      {change !== 0 && (
                                        <Badge variant={change > 0 ? 'destructive' : 'default'} className="text-xs px-1">
                                          {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              )}
            </ScrollArea>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}