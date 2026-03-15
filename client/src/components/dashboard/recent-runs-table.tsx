import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, MoreHorizontal, Eye, Target, TestTube, Baseline, RotateCcw, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Run {
  id: string;
  evalSpecId: string;
  status: string;
  decision?: string;
  cost?: number;
  duration?: number;
  triggeredBy: string;
  startedAt: string;
  isBaseline?: boolean;
  errorMessage?: string;
}

interface RecentRunsTableProps {
  runs?: Run[];
  isLoading?: boolean;
  onViewDetails?: (runId: string) => void;
  onSetBaseline?: (runId: string) => void;
  onRerun?: (runId: string) => void;
  onTestPolicies?: (runId: string) => void;
}

export function RecentRunsTable({ 
  runs, 
  isLoading, 
  onViewDetails, 
  onSetBaseline, 
  onRerun, 
  onTestPolicies 
}: RecentRunsTableProps) {
  const [, setLocation] = useLocation();
  const [quickViewRunId, setQuickViewRunId] = useState<string | null>(null);

  const { data: quickViewSamples } = useQuery({
    queryKey: [`/api/runs/${quickViewRunId}/samples`],
    enabled: !!quickViewRunId,
  });

  const handleViewDetails = (runId: string) => {
    setLocation(`/runs/${runId}`);
    onViewDetails?.(runId);
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success/10 text-success border-success/20';
      case 'running':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'failed':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'pending':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'pass':
        return 'status-pass';
      case 'warn':
        return 'status-warn';
      case 'fail':
        return 'status-fail';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success';
      case 'running':
        return 'bg-primary';
      case 'failed':
        return 'bg-destructive';
      case 'pending':
        return 'bg-warning';
      default:
        return 'bg-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <th key={i} className="text-left py-3 px-6">
                      <Skeleton className="h-4 w-20" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-4 px-6">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent Evaluation Runs</h2>
            <p className="text-sm text-muted-foreground">Monitor the latest evaluation results and quality gates</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search runs..." 
                className="pl-10 w-64"
                data-testid="input-search-runs"
              />
            </div>
            <Button variant="outline" size="icon" data-testid="button-filter-runs">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Run ID</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Eval Spec</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Pass Rate</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Cost</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Duration</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Triggered By</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs?.length ? (
                runs.slice(0, 10).map((run) => (
                  <tr key={run.id} className="hover:bg-muted/25">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", getStatusDot(run.status))}></div>
                        <span className="font-mono text-sm" data-testid={`run-id-${run.id}`}>
                          {run.id.slice(0, 8)}
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
                      <div>
                        <p className="font-medium">Eval Spec {run.evalSpecId.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">Evaluation specification</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {run.status === 'failed' && run.errorMessage ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge 
                                className={cn("px-2 py-1 text-xs font-medium rounded-full border cursor-help", getStatusColor(run.status))}
                                data-testid={`status-${run.id}`}
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
                          className={cn("px-2 py-1 text-xs font-medium rounded-full border", getStatusColor(run.status))}
                          data-testid={`status-${run.id}`}
                        >
                          {run.status.toUpperCase()}
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {run.decision ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">-</span>
                          <span className="text-xs text-muted-foreground">-</span>
                        </div>
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
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-muted rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {run.triggeredBy.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm">User {run.triggeredBy.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setQuickViewRunId(run.id)}
                                data-testid={`button-quick-view-${run.id}`}
                              >
                                <Zap className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Quick view outputs</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              data-testid={`actions-${run.id}`}
                            >
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
                              onClick={() => onRerun?.(run.id)}
                              data-testid={`button-rerun-${run.id}`}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Rerun Evaluation
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => onSetBaseline?.(run.id)}
                              data-testid={`button-set-baseline-${run.id}`}
                            >
                              <Target className="w-4 h-4 mr-2" />
                              Set as Baseline
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => onTestPolicies?.(run.id)}
                              data-testid={`button-test-policies-${run.id}`}
                            >
                              <TestTube className="w-4 h-4 mr-2" />
                              Test Policies
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-muted/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Search className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No runs found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create an evaluation specification and run your first evaluation
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {runs?.length ? (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium">1-{Math.min(10, runs.length)}</span> of{' '}
              <span className="font-medium">{runs.length}</span> runs
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled data-testid="button-previous-runs">
                Previous
              </Button>
              <Button variant="outline" size="sm" data-testid="button-next-runs">
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
      
      {/* Quick View Dialog */}
      <Dialog open={!!quickViewRunId} onOpenChange={(open) => !open && setQuickViewRunId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Quick Output Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {quickViewSamples && quickViewSamples.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Total Samples</p>
                    <p className="text-xl font-bold">{quickViewSamples.length}</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">With Outputs</p>
                    <p className="text-xl font-bold">
                      {quickViewSamples.filter((s: any) => s.actualOutput && s.actualOutput !== 'N/A').length}
                    </p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Average Score</p>
                    <p className="text-xl font-bold">
                      {(() => {
                        const allScores = quickViewSamples.flatMap((s: any) => {
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
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  <p className="text-sm font-medium">Sample Outputs (First 5)</p>
                  {quickViewSamples.slice(0, 5).map((sample: any, idx: number) => {
                    const actualOutput = sample.actualOutput || 'N/A';
                    const preview = typeof actualOutput === 'string' 
                      ? (actualOutput.length > 150 ? actualOutput.substring(0, 150) + '...' : actualOutput)
                      : JSON.stringify(actualOutput).substring(0, 150) + '...';
                    
                    return (
                      <div key={idx} className="border rounded-lg p-3 bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Sample {sample.sampleIndex + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setQuickViewRunId(null);
                              handleViewDetails(sample.runId || quickViewRunId || '');
                            }}
                            className="h-7 text-xs"
                          >
                            View Full Details
                          </Button>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-background p-2 rounded border">
                          {preview}
                        </pre>
                      </div>
                    );
                  })}
                  {quickViewSamples.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      + {quickViewSamples.length - 5} more samples. Click "View Full Details" to see all.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setQuickViewRunId(null)}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      setQuickViewRunId(null);
                      if (quickViewRunId) handleViewDetails(quickViewRunId);
                    }}
                  >
                    View All Details
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading sample outputs...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
