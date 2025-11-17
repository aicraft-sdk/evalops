import { useEffect, useState } from 'react';
import { useWebSocket } from "@/hooks/useWebSocket";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, Play, CheckCircle, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface RunUpdate {
  id: string;
  status: 'running' | 'completed' | 'failed';
  decision?: 'pass' | 'warn' | 'fail';
  progress?: number;
  duration?: number;
  cost?: number;
}

export function LiveRunStatus() {
  const { lastMessage } = useWebSocket();
  const queryClient = useQueryClient();
  const [activeRuns, setActiveRuns] = useState<RunUpdate[]>([]);

  // Fetch initial active runs
  const { data: runs } = useQuery({
    queryKey: ['/api/runs'],
    select: (data: any[]) => data.filter(run => run.status === 'running').slice(0, 3)
  });

  useEffect(() => {
    if (runs) {
      setActiveRuns(runs.map(run => ({
        id: run.id,
        status: run.status,
        decision: run.decision,
        progress: 0,
        duration: run.duration,
        cost: run.cost
      })));
    }
  }, [runs]);

  useEffect(() => {
    if (lastMessage?.type === 'run_update') {
      const runUpdate = lastMessage.data as RunUpdate;
      
      setActiveRuns(prev => {
        const existing = prev.find(run => run.id === runUpdate.id);
        if (existing) {
          // Update existing run
          return prev.map(run => 
            run.id === runUpdate.id ? { ...run, ...runUpdate } : run
          );
        } else if (runUpdate.status === 'running') {
          // Add new running run
          return [runUpdate, ...prev.slice(0, 2)];
        }
        return prev;
      });

      // Remove completed/failed runs after 5 seconds
      if (runUpdate.status === 'completed' || runUpdate.status === 'failed') {
        setTimeout(() => {
          setActiveRuns(prev => prev.filter(run => run.id !== runUpdate.id));
          // Invalidate runs query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['/api/runs'] });
        }, 5000);
      }
    }
  }, [lastMessage, queryClient]);

  const getStatusIcon = (status: string, decision?: string) => {
    switch (status) {
      case 'running':
        return <Play className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return decision === 'pass' ? 
          <CheckCircle className="w-4 h-4 text-green-500" /> :
          <XCircle className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string, decision?: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'completed': 
        return decision === 'pass' ? 
          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' :
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  if (activeRuns.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-4" data-testid="no-active-runs">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No active runs</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="live-run-status">
      {activeRuns.map((run) => (
        <div 
          key={run.id} 
          className="p-3 border rounded-lg bg-card"
          data-testid={`run-${run.id}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getStatusIcon(run.status, run.decision)}
              <span className="text-sm font-medium truncate">
                Run {run.id.slice(0, 8)}
              </span>
            </div>
            <Badge 
              variant="outline" 
              className={getStatusColor(run.status, run.decision)}
              data-testid={`status-${run.id}`}
            >
              {run.status === 'completed' && run.decision ? run.decision : run.status}
            </Badge>
          </div>
          
          {run.status === 'running' && (
            <Progress 
              value={run.progress || 0} 
              className="h-2 mb-2"
              data-testid={`progress-${run.id}`}
            />
          )}
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span data-testid={`duration-${run.id}`}>
              {run.duration ? `${run.duration}s` : 'Starting...'}
            </span>
            {run.cost && (
              <span data-testid={`cost-${run.id}`}>
                ${run.cost.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}