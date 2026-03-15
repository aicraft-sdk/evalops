import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  TrendingUp, 
  Target,
  Shield,
  Brain,
  Search,
  Gauge,
  Info,
  HelpCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from "lucide-react";
import { Link } from "wouter";

export default function RunDetails() {
  const { runId } = useParams();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showGuide, setShowGuide] = useState(false);
  const [expandedSamples, setExpandedSamples] = useState<Set<number>>(new Set());

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const toggleSampleExpansion = (idx: number) => {
    const newExpanded = new Set(expandedSamples);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
    }
    setExpandedSamples(newExpanded);
  };

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

  const { data: runDetails, isLoading: detailsLoading } = useQuery<any>({
    queryKey: [`/api/runs/${runId}/details`],
    enabled: isAuthenticated && !!runId,
  });

  const { data: sampleResults } = useQuery<any[]>({
    queryKey: [`/api/runs/${runId}/samples`],
    enabled: isAuthenticated && !!runId,
  });

  const { data: policyResults } = useQuery<any[]>({
    queryKey: [`/api/runs/${runId}/policy-results`],
    enabled: isAuthenticated && !!runId,
  });

  const { data: baselineComparison } = useQuery<any>({
    queryKey: [`/api/runs/${runId}/baseline-comparison`],
    enabled: isAuthenticated && !!runId,
  });

  if (!isAuthenticated || isLoading) {
    return <div>Loading...</div>;
  }

  if (detailsLoading) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div>Loading run details...</div>
        </main>
      </div>
    );
  }

  if (!runDetails) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div>Run not found</div>
        </main>
      </div>
    );
  }

  const metrics = runDetails.metrics || {};
  const evaluatorResults = Object.entries(metrics).filter(([key]) => 
    !['cost', 'duration', 'latencyP50', 'latencyP95', 'errorRate'].includes(key)
  );

  // Helper function to get evaluator icon and color
  const getEvaluatorStyle = (evaluatorType: string) => {
    const styles: Record<string, { icon: any; color: string; bgColor: string }> = {
      'exactMatch': { icon: Target, color: 'text-blue-600', bgColor: 'bg-blue-50' },
      'battle': { icon: TrendingUp, color: 'text-purple-600', bgColor: 'bg-purple-50' },
      'factuality': { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
      'security': { icon: Shield, color: 'text-red-600', bgColor: 'bg-red-50' },
      'answerRelevancy': { icon: Target, color: 'text-orange-600', bgColor: 'bg-orange-50' },
      'jsonValidity': { icon: CheckCircle, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
      'contextPrecision': { icon: Search, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
      'contextRecall': { icon: Brain, color: 'text-teal-600', bgColor: 'bg-teal-50' },
      'contextRelevancy': { icon: Target, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
      'faithfulness': { icon: Shield, color: 'text-rose-600', bgColor: 'bg-rose-50' },
      'answerCorrectness': { icon: CheckCircle, color: 'text-violet-600', bgColor: 'bg-violet-50' },
      'piiDetection': { icon: Shield, color: 'text-red-600', bgColor: 'bg-red-50' },
      'jailbreakDetection': { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    };
    return styles[evaluatorType] || { icon: Gauge, color: 'text-gray-600', bgColor: 'bg-gray-50' };
  };

  // Helper function to format evaluator names
  const formatEvaluatorName = (key: string): string => {
    const names: Record<string, string> = {
      'exactMatch': 'Exact Match',
      'battle': 'Battle (A/B Testing)',
      'factuality': 'Factuality Check', 
      'security': 'Security & Safety',
      'answerRelevancy': 'Answer Relevancy',
      'jsonValidity': 'JSON Validity',
      'contextPrecision': 'Context Precision',
      'contextRecall': 'Context Recall',
      'contextRelevancy': 'Context Relevancy',
      'faithfulness': 'Faithfulness',
      'answerCorrectness': 'Answer Correctness',
      'piiDetection': 'PII Detection',
      'jailbreakDetection': 'Jailbreak Detection',
      'schemaValidity': 'Schema Validation',
      'llmAsJudgeWinRate': 'LLM as Judge'
    };
    return names[key] || key;
  };

  // Helper function to get evaluator descriptions
  const getEvaluatorDescription = (evaluatorType: string): string => {
    const descriptions: Record<string, string> = {
      'exactMatch': 'Compares outputs for exact string matches. Perfect for deterministic tasks with clear right/wrong answers.',
      'battle': 'A/B testing between different model outputs using human or LLM judges to determine preference.',
      'factuality': 'Verifies factual accuracy of responses against known ground truth or authoritative sources.',
      'security': 'Comprehensive security assessment including prompt injection, jailbreak attempts, and harmful content detection.',
      'answerRelevancy': 'Measures how well the response addresses the specific question asked, ignoring tangential information.',
      'jsonValidity': 'Validates that outputs conform to proper JSON syntax and structure requirements.',
      'contextPrecision': 'Evaluates whether retrieved context contains relevant information for answering the query.',
      'contextRecall': 'Measures completeness - whether all necessary context was retrieved from the knowledge base.',
      'contextRelevancy': 'Assesses relevance of retrieved context passages to the input query.',
      'faithfulness': 'Checks if the generated response is grounded in and faithful to the provided context.',
      'answerCorrectness': 'Holistic evaluation combining factual accuracy, completeness, and relevance of responses.',
      'piiDetection': 'Scans for personally identifiable information (PII) like emails, phone numbers, SSNs, and addresses.',
      'jailbreakDetection': 'Detects attempts to bypass AI safety measures through prompt injection or system override techniques.',
      'schemaValidity': 'Validates outputs against predefined schemas or structured formats.',
      'llmAsJudgeWinRate': 'Uses large language models as judges to evaluate response quality on various criteria.'
    };
    return descriptions[evaluatorType] || 'Custom evaluator for assessing specific quality metrics.';
  };

  // Calculate overall pass rate
  const passRate = evaluatorResults.length > 0 
    ? evaluatorResults.reduce((sum, [_, result]: [string, any]) => {
        const mean = result.mean;
        return sum + (isNaN(mean) || mean === null || mean === undefined ? 0 : mean);
      }, 0) / evaluatorResults.length 
    : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/runs">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Runs
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold">Run Details</h1>
                <p className="text-muted-foreground">
                  {runDetails.evalSpecName} • {new Date(runDetails.startedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Dialog open={showGuide} onOpenChange={setShowGuide}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Evaluator Guide
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-blue-600" />
                      Evaluator Guide
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h3 className="font-semibold text-blue-900 mb-2">Scoring System</h3>
                      <div className="text-sm text-blue-800 space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span><strong>80%+ (Excellent):</strong> High quality, meets expectations</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <span><strong>60-79% (Good):</strong> Acceptable quality, minor issues</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span><strong>&lt;60% (Needs Improvement):</strong> Quality issues requiring attention</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="font-semibold">Available Evaluators</h3>
                      <div className="grid gap-3">
                        {Object.entries({
                          'exactMatch': 'Exact Match',
                          'battle': 'Battle (A/B Testing)',
                          'factuality': 'Factuality Check',
                          'security': 'Security & Safety',
                          'answerRelevancy': 'Answer Relevancy',
                          'jsonValidity': 'JSON Validity',
                          'contextPrecision': 'Context Precision',
                          'contextRecall': 'Context Recall',
                          'contextRelevancy': 'Context Relevancy',
                          'faithfulness': 'Faithfulness',
                          'answerCorrectness': 'Answer Correctness',
                          'piiDetection': 'PII Detection',
                          'jailbreakDetection': 'Jailbreak Detection',
                          'schemaValidity': 'Schema Validation',
                          'llmAsJudgeWinRate': 'LLM as Judge'
                        }).map(([key, name]) => {
                          const style = getEvaluatorStyle(key);
                          const IconComponent = style.icon;
                          return (
                            <div key={key} className="border rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <IconComponent className={`h-4 w-4 ${style.color}`} />
                                <span className="font-medium">{name}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">{getEvaluatorDescription(key)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Badge 
                variant={runDetails.status === 'completed' ? 'default' : 
                         runDetails.status === 'failed' ? 'destructive' : 'secondary'}
              >
                {runDetails.status}
              </Badge>
              <Badge 
                variant={runDetails.decision === 'pass' ? 'default' : 
                         runDetails.decision === 'fail' ? 'destructive' : 'secondary'}
              >
                {runDetails.decision || 'pending'}
              </Badge>
            </div>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isNaN(passRate) ? 'N/A' : `${(passRate * 100).toFixed(1)}%`}</div>
                <Progress value={passRate * 100} className="mt-2" />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Evaluators Run</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{evaluatorResults.length}</div>
                <p className="text-xs text-muted-foreground">Active evaluators</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Duration</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{runDetails.duration || 0}s</div>
                <p className="text-xs text-muted-foreground">Execution time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cost</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${(runDetails.cost || 0).toFixed(4)}</div>
                <p className="text-xs text-muted-foreground">Total cost</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Output Preview Section */}
          {sampleResults && sampleResults.length > 0 && (
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      Output Summary
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quick preview of test outputs and results
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const samplesTab = document.querySelector('[value="samples"]') as HTMLElement;
                      if (samplesTab) samplesTab.click();
                    }}
                    className="gap-2"
                  >
                    View All Samples
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-1">Total Samples</p>
                    <p className="text-2xl font-bold">{sampleResults.length}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-1">Average Score</p>
                    <p className="text-2xl font-bold">
                      {(() => {
                        const allScores = sampleResults.flatMap((s: any) => {
                          const results = s.evaluationResults || {};
                          return Object.entries(results)
                            .filter(([_, v]: [string, any]) => typeof v === 'number' && !['cost', 'latency', 'tokens'].some(k => v.toString().includes(k)))
                            .map(([_, v]: [string, any]) => v);
                        });
                        const avg = allScores.length > 0 
                          ? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length 
                          : 0;
                        return avg > 0 ? `${(avg * 100).toFixed(1)}%` : 'N/A';
                      })()}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-1">Samples with Outputs</p>
                    <p className="text-2xl font-bold">
                      {sampleResults.filter((s: any) => s.actualOutput && s.actualOutput !== 'N/A').length} / {sampleResults.length}
                    </p>
                  </div>
                </div>
                
                {/* Preview of first 3 samples */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Sample Previews</p>
                  <div className="space-y-2">
                    {sampleResults.slice(0, 3).map((sample: any, idx: number) => {
                      const actualOutput = sample.actualOutput || 'N/A';
                      const preview = typeof actualOutput === 'string' 
                        ? (actualOutput.length > 100 ? actualOutput.substring(0, 100) + '...' : actualOutput)
                        : JSON.stringify(actualOutput).substring(0, 100) + '...';
                      
                      const evalResults = sample.evaluationResults || {};
                      const scores = Object.entries(evalResults)
                        .filter(([_, v]: [string, any]) => typeof v === 'number' && !['cost', 'latency', 'tokens'].some(k => v.toString().includes(k)))
                        .map(([_, v]: [string, any]) => v);
                      const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
                      const status = avgScore >= 0.8 ? 'pass' : avgScore >= 0.6 ? 'warn' : 'fail';
                      
                      return (
                        <div 
                          key={idx} 
                          className="bg-white dark:bg-gray-900 p-3 rounded-lg border cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                          onClick={() => {
                            const samplesTab = document.querySelector('[value="samples"]') as HTMLElement;
                            if (samplesTab) samplesTab.click();
                            setTimeout(() => {
                              const sampleElement = document.querySelector(`[data-sample-index="${sample.sampleIndex}"]`);
                              if (sampleElement) {
                                sampleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                toggleSampleExpansion(idx);
                              }
                            }, 100);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Sample {sample.sampleIndex + 1}</span>
                              {status === 'pass' && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
                              {status === 'warn' && <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
                              {status === 'fail' && <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                            </div>
                            {avgScore > 0 && (
                              <Badge variant={status === 'pass' ? 'default' : status === 'warn' ? 'secondary' : 'destructive'}>
                                {(avgScore * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono line-clamp-2">
                            {preview}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {sampleResults.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      + {sampleResults.length - 3} more samples. Click "View All Samples" to see all outputs.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="evaluators" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="evaluators">Evaluator Results</TabsTrigger>
              <TabsTrigger value="baseline">Baseline Comparison</TabsTrigger>
              <TabsTrigger value="samples">Sample Details</TabsTrigger>
              <TabsTrigger value="policies">Policy Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="evaluators" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {evaluatorResults.map(([evaluatorType, result]: [string, any]) => {
                  const style = getEvaluatorStyle(evaluatorType);
                  const IconComponent = style.icon;
                  const score = (result.mean || 0) * 100;
                  
                  return (
                    <Card key={evaluatorType} className="relative overflow-hidden border-l-4" style={{borderLeftColor: style.color.replace('text-', '#')}}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className={`text-sm font-medium flex items-center gap-2 text-foreground`} title={getEvaluatorDescription(evaluatorType)}>
                            <IconComponent className={`h-4 w-4 ${style.color}`} />
                            {formatEvaluatorName(evaluatorType)}
                            <HelpCircle className="h-3 w-3 text-muted-foreground ml-1" />
                          </CardTitle>
                          <Badge variant={isNaN(score) || score === 0 ? 'outline' : score >= 80 ? 'default' : score >= 60 ? 'secondary' : 'destructive'}>
                            {isNaN(score) ? <AlertTriangle className="h-3 w-3 mr-1" /> :
                             score === 0 ? <span className="h-3 w-3 mr-1">−</span> :
                             score >= 80 ? <CheckCircle className="h-3 w-3 mr-1" /> : 
                             score >= 60 ? <AlertTriangle className="h-3 w-3 mr-1" /> :
                             <XCircle className="h-3 w-3 mr-1" />}
                            {isNaN(score) ? 'N/A' : score === 0 ? '0%' : `${score.toFixed(1)}%`}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <Progress value={score} className="w-full" />
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Mean</p>
                              <p className="font-semibold">{isNaN(score) ? 'N/A' : `${score.toFixed(1)}%`}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Std Dev</p>
                              <p className="font-semibold">{isNaN(result.std) || !result.std ? 'N/A' : `${((result.std || 0) * 100).toFixed(1)}%`}</p>
                            </div>
                          </div>
                          {result.confidenceInterval && (
                            <div className="text-xs text-muted-foreground">
                              95% CI: [{isNaN(result.confidenceInterval.lower) ? 'N/A' : (result.confidenceInterval.lower * 100).toFixed(1)}%, {isNaN(result.confidenceInterval.upper) ? 'N/A' : (result.confidenceInterval.upper * 100).toFixed(1)}%]
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="baseline" className="space-y-6">
              {baselineComparison?.hasBaseline ? (
                <div className="space-y-6">
                  {/* Baseline Overview */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-blue-600" />
                            Baseline Comparison Analysis
                          </CardTitle>
                          <p className="text-muted-foreground mt-1">
                            Statistical comparison against baseline run {baselineComparison.baseline.id.slice(0, 8)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-blue-600 border-blue-200">
                          Baseline Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Current Run</p>
                          <div className="text-2xl font-bold">{isNaN(passRate) ? 'N/A' : (passRate * 100).toFixed(1) + '%'}</div>
                          <p className="text-xs text-muted-foreground">Average Score</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Baseline</p>
                          <div className="text-2xl font-bold">{
                            !baselineComparison.baseline.score || isNaN(baselineComparison.baseline.score) ? 'N/A' : 
                            (baselineComparison.baseline.score * 100).toFixed(1) + '%'
                          }</div>
                          <p className="text-xs text-muted-foreground">Baseline Score</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Performance</p>
                          <div className={`text-2xl font-bold flex items-center gap-1 ${
                            !baselineComparison.baseline.score || isNaN(baselineComparison.baseline.score) || isNaN(passRate) ? 'text-gray-600' :
                            (passRate - baselineComparison.baseline.score) > 0 ? 'text-green-600' : 
                            (passRate - baselineComparison.baseline.score) < 0 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {!baselineComparison.baseline.score || isNaN(baselineComparison.baseline.score) || isNaN(passRate) ? '→ N/A' :
                             (passRate - baselineComparison.baseline.score) > 0 ? `↗ ${Math.abs((passRate - baselineComparison.baseline.score) * 100).toFixed(1)}%` : 
                             (passRate - baselineComparison.baseline.score) < 0 ? `↘ ${Math.abs((passRate - baselineComparison.baseline.score) * 100).toFixed(1)}%` : 
                             '→ 0.0%'}
                          </div>
                          <p className="text-xs text-muted-foreground">vs Baseline</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Evaluator-by-Evaluator Comparison */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Detailed Evaluator Comparison</CardTitle>
                      <p className="text-muted-foreground">
                        Performance breakdown by evaluator with statistical significance testing
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {evaluatorResults.map(([evaluatorType, result]: [string, any]) => {
                          const baselineMetric = baselineComparison.baseline.metrics?.[evaluatorType];
                          const currentScore = (result.mean || 0) * 100;
                          const baselineScore = baselineMetric ? (baselineMetric.mean || 0) * 100 : 0;
                          const difference = currentScore - baselineScore;
                          const style = getEvaluatorStyle(evaluatorType);
                          const IconComponent = style.icon;

                          return (
                            <div key={evaluatorType} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <IconComponent className={`h-4 w-4 ${style.color}`} />
                                  <span className="font-medium">{formatEvaluatorName(evaluatorType)}</span>
                                </div>
                                <div className={`text-sm font-semibold flex items-center gap-1 ${
                                  difference > 0 ? 'text-green-600' : 
                                  difference < 0 ? 'text-red-600' : 'text-gray-600'
                                }`}>
                                  {difference > 0 ? '↗' : difference < 0 ? '↘' : '→'}
                                  {Math.abs(difference).toFixed(1)}%
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Current</span>
                                    <span className="font-medium">{currentScore.toFixed(1)}%</span>
                                  </div>
                                  <Progress value={currentScore} className="h-2" />
                                  {result.confidenceInterval && (
                                    <div className="text-xs text-muted-foreground">
                                      95% CI: [{(result.confidenceInterval[0] * 100).toFixed(1)}%, {(result.confidenceInterval[1] * 100).toFixed(1)}%]
                                    </div>
                                  )}
                                </div>
                                
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Baseline</span>
                                    <span className="font-medium">{baselineScore.toFixed(1)}%</span>
                                  </div>
                                  <Progress value={baselineScore} className="h-2" />
                                  {baselineMetric?.confidenceInterval && (
                                    <div className="text-xs text-muted-foreground">
                                      95% CI: [{(baselineMetric.confidenceInterval[0] * 100).toFixed(1)}%, {(baselineMetric.confidenceInterval[1] * 100).toFixed(1)}%]
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Statistical Significance */}
                              {baselineMetric && (
                                <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                                  <div className="grid grid-cols-3 gap-4">
                                    <div>
                                      <span className="text-muted-foreground">Statistical Significance:</span>
                                      <div className="font-medium">
                                        {Math.abs(difference) > 5 ? 
                                          <Badge variant={difference > 0 ? "default" : "destructive"} className="text-xs">
                                            {difference > 0 ? "Significant Improvement" : "Significant Decline"}
                                          </Badge> :
                                          <Badge variant="secondary" className="text-xs">No Significant Change</Badge>
                                        }
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Sample Size:</span>
                                      <div className="font-medium">{result.sampleCount || 'N/A'} samples</div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Effect Size:</span>
                                      <div className="font-medium">
                                        {Math.abs(difference) > 10 ? 'Large' : 
                                         Math.abs(difference) > 5 ? 'Medium' : 'Small'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Performance Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-medium">Cost Efficiency</h4>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current Cost:</span>
                            <span className="font-medium">${(runDetails.cost || 0).toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Baseline Cost:</span>
                            <span className="font-medium">${(baselineComparison.baseline.cost || 0).toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cost Change:</span>
                            <span className={`font-medium ${
                              (runDetails.cost || 0) < (baselineComparison.baseline.cost || 0) ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {((runDetails.cost || 0) - (baselineComparison.baseline.cost || 0) < 0 ? '-$' : '+$')}
                              {Math.abs((runDetails.cost || 0) - (baselineComparison.baseline.cost || 0)).toFixed(4)}
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <h4 className="font-medium">Performance Metrics</h4>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current Duration:</span>
                            <span className="font-medium">{runDetails.duration || 0}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Baseline Duration:</span>
                            <span className="font-medium">{baselineComparison.baseline.duration || 0}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Speed Change:</span>
                            <span className={`font-medium ${
                              (runDetails.duration || 0) < (baselineComparison.baseline.duration || 0) ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {((runDetails.duration || 0) - (baselineComparison.baseline.duration || 0) < 0 ? 'Faster by ' : 'Slower by ')}
                              {Math.abs((runDetails.duration || 0) - (baselineComparison.baseline.duration || 0))}s
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="text-center py-12">
                    <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Baseline Available</h3>
                    <p className="text-muted-foreground mb-4">
                      {baselineComparison?.message || "No baseline has been set for this evaluation specification."}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Set a baseline run to enable performance comparison and regression detection.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="samples" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sample-by-Sample Results</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Detailed breakdown of each test sample across all evaluators. Click to expand and view full outputs.
                  </p>
                </CardHeader>
                <CardContent>
                  {sampleResults && sampleResults.length > 0 ? (
                    <div className="space-y-4">
                      {sampleResults.map((sample: any, idx: number) => {
                        const isExpanded = expandedSamples.has(idx);
                        const actualOutput = sample.actualOutput || 'N/A';
                        const expectedOutput = sample.expectedOutput || 'N/A';
                        const inputText = typeof sample.input === 'string' ? sample.input : JSON.stringify(sample.input, null, 2);
                        
                        // Calculate overall score for this sample
                        const evalResults = sample.evaluationResults || {};
                        const scores = Object.entries(evalResults)
                          .filter(([_, v]: [string, any]) => typeof v === 'number' && !['cost', 'latency', 'tokens'].some(k => v.toString().includes(k)))
                          .map(([_, v]: [string, any]) => v);
                        const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
                        const overallStatus = avgScore >= 0.8 ? 'pass' : avgScore >= 0.6 ? 'warn' : 'fail';
                        
                        return (
                          <Card key={idx} data-sample-index={sample.sampleIndex} className={`border-l-4 ${
                            overallStatus === 'pass' ? 'border-l-green-500' : 
                            overallStatus === 'warn' ? 'border-l-yellow-500' : 
                            'border-l-red-500'
                          }`}>
                            <CardContent className="pt-6">
                              <div className="space-y-4">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${
                                      overallStatus === 'pass' ? 'bg-green-100 dark:bg-green-900/20' :
                                      overallStatus === 'warn' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                                      'bg-red-100 dark:bg-red-900/20'
                                    }`}>
                                      {overallStatus === 'pass' ? (
                                        <CheckCircle className={`h-5 w-5 ${
                                          overallStatus === 'pass' ? 'text-green-600 dark:text-green-400' : ''
                                        }`} />
                                      ) : overallStatus === 'warn' ? (
                                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                      )}
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-lg">Sample {sample.sampleIndex + 1}</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {avgScore > 0 ? `Average Score: ${(avgScore * 100).toFixed(1)}%` : 'No scores available'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">Rep {sample.repetition + 1}</Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleSampleExpansion(idx)}
                                      className="gap-2"
                                    >
                                      {isExpanded ? (
                                        <>
                                          <EyeOff className="h-4 w-4" />
                                          Collapse
                                        </>
                                      ) : (
                                        <>
                                          <Eye className="h-4 w-4" />
                                          Expand
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>

                                {/* Input Section */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium">Test Input</p>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="max-w-xs">This is the input provided to the AI model for testing</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(inputText, 'Input')}
                                      className="h-7 gap-1"
                                    >
                                      <Copy className="h-3 w-3" />
                                      Copy
                                    </Button>
                                  </div>
                                  <div className="bg-muted/50 p-4 rounded-lg border">
                                    <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                      {inputText}
                                    </pre>
                                  </div>
                                </div>

                                {/* Expected vs Actual Comparison */}
                                <Collapsible open={isExpanded} onOpenChange={() => toggleSampleExpansion(idx)}>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" className="w-full justify-between">
                                      <span className="font-medium">Expected vs Actual Output</span>
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="space-y-4">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                      {/* Expected Output */}
                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">Expected Output</p>
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="max-w-xs">The expected or reference output for this test case</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(expectedOutput, 'Expected Output')}
                                            className="h-7 gap-1"
                                          >
                                            <Copy className="h-3 w-3" />
                                            Copy
                                          </Button>
                                        </div>
                                        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 min-h-[100px]">
                                          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                            {expectedOutput}
                                          </pre>
                                        </div>
                                      </div>

                                      {/* Actual Output */}
                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">Actual Output</p>
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p className="max-w-xs">This is the AI's response to your test input</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(actualOutput, 'Actual Output')}
                                            className="h-7 gap-1"
                                          >
                                            <Copy className="h-3 w-3" />
                                            Copy
                                          </Button>
                                        </div>
                                        <div className={`p-4 rounded-lg border min-h-[100px] ${
                                          expectedOutput !== 'N/A' && actualOutput !== 'N/A' && expectedOutput === actualOutput
                                            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                                            : 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                                        }`}>
                                          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                            {actualOutput}
                                          </pre>
                                        </div>
                                        {expectedOutput !== 'N/A' && actualOutput !== 'N/A' && expectedOutput !== actualOutput && (
                                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Output differs from expected
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>

                                {/* Evaluator Scores */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <p className="text-sm font-medium">Evaluator Scores</p>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="max-w-xs">Scores from different evaluators measuring various quality aspects</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {Object.entries(evalResults).map(([key, value]: [string, any]) => {
                                      if (typeof value !== 'number') return null;
                                      
                                      // Handle different metric types
                                      const isLatencyMetric = key.toLowerCase().includes('latency') || key.toLowerCase().includes('duration');
                                      const isPercentageMetric = !isLatencyMetric && !key.includes('cost') && !key.includes('tokens');
                                      
                                      let displayValue: string;
                                      let colorClass: string;
                                      let bgColorClass: string;
                                      
                                      if (isLatencyMetric) {
                                        displayValue = `${value.toFixed(1)}ms`;
                                        if (key.includes('P95') || key.includes('p95')) {
                                          colorClass = value < 500 ? 'text-green-600 dark:text-green-400' : value < 1000 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
                                          bgColorClass = value < 500 ? 'bg-green-50 dark:bg-green-950/20' : value < 1000 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-red-50 dark:bg-red-950/20';
                                        } else {
                                          colorClass = value < 200 ? 'text-green-600 dark:text-green-400' : value < 500 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
                                          bgColorClass = value < 200 ? 'bg-green-50 dark:bg-green-950/20' : value < 500 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-red-50 dark:bg-red-950/20';
                                        }
                                      } else if (isPercentageMetric) {
                                        const score = value * 100;
                                        displayValue = `${score.toFixed(1)}%`;
                                        colorClass = score >= 80 ? 'text-green-600 dark:text-green-400' : score >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
                                        bgColorClass = score >= 80 ? 'bg-green-50 dark:bg-green-950/20' : score >= 60 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-red-50 dark:bg-red-950/20';
                                      } else {
                                        displayValue = value.toFixed(4);
                                        colorClass = 'text-gray-600 dark:text-gray-400';
                                        bgColorClass = 'bg-gray-50 dark:bg-gray-950/20';
                                      }
                                      
                                      return (
                                        <div key={key} className={`p-3 rounded-lg border ${bgColorClass}`}>
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-muted-foreground">{formatEvaluatorName(key)}</span>
                                            {isPercentageMetric && (
                                              <span className={`text-xs font-bold ${colorClass}`}>
                                                {value >= 0.8 ? '✓' : value >= 0.6 ? '⚠' : '✗'}
                                              </span>
                                            )}
                                          </div>
                                          <span className={`text-sm font-semibold ${colorClass}`}>
                                            {displayValue}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No sample results available</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Sample results will appear here once the evaluation run completes
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="policies" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Policy Evaluation Results</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Quality gates and policy compliance analysis
                  </p>
                </CardHeader>
                <CardContent>
                  {policyResults && policyResults.length > 0 ? (
                    <div className="space-y-4">
                      {policyResults.map((policy: any, idx: number) => (
                        <div key={idx} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">{policy.policyName}</h4>
                            <Badge variant={policy.violated ? 'destructive' : 'default'}>
                              {policy.violated ? 'VIOLATED' : 'PASSED'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{policy.description}</p>
                          {policy.violations && policy.violations.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-red-600 mb-2">Violations:</p>
                              <ul className="text-sm text-red-600 space-y-1">
                                {policy.violations.map((violation: string, vIdx: number) => (
                                  <li key={vIdx}>• {violation}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No policy violations found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}