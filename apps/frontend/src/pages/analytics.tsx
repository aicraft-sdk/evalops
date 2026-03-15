import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TrendsChart } from "@/components/analytics/TrendsChart";
import { CostBreakdownChart } from "@/components/analytics/CostBreakdownChart";
import { PerformanceComparisonTable } from "@/components/analytics/PerformanceComparisonTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, TrendingUp, DollarSign, Target, Clock, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Analytics() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [timeRange, setTimeRange] = useState("30");

  const { data: trendsData, isLoading: trendsLoading, error: trendsError } = useQuery({
    queryKey: ["/api/analytics/trends", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/trends?days=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false
  });

  const { data: costData, isLoading: costLoading } = useQuery({
    queryKey: ["/api/analytics/cost-breakdown", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/cost-breakdown?days=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false
  });

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ["/api/analytics/performance-comparison", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/performance-comparison?days=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false
  });

  // Handle unauthorized errors
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

  useEffect(() => {
    if (trendsError && isUnauthorizedError(trendsError as Error)) {
      toast({
        title: "Session Expired",
        description: "Please log in again to continue.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [trendsError, toast]);

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  // Calculate summary metrics from trends data
  const summaryMetrics = trendsData && trendsData.length > 0 ? {
    totalRuns: trendsData.reduce((sum: number, day: any) => sum + day.totalRuns, 0),
    avgSuccessRate: Math.round(trendsData.reduce((sum: number, day: any) => sum + day.successRate, 0) / trendsData.length),
    totalCost: trendsData.reduce((sum: number, day: any) => sum + day.totalCost, 0),
    avgDuration: Math.round(trendsData.reduce((sum: number, day: any) => sum + day.avgDuration, 0) / trendsData.length)
  } : null;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <header className="px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold" data-testid="text-analytics-title">
                  Advanced Analytics
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Deep insights into your evaluation performance and costs
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </header>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Summary Metrics Cards */}
          {summaryMetrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summaryMetrics.totalRuns.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    Last {timeRange} days
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summaryMetrics.avgSuccessRate}%</div>
                  <p className="text-xs text-muted-foreground">
                    <Badge variant={summaryMetrics.avgSuccessRate >= 80 ? "default" : "destructive"} className="text-xs">
                      {summaryMetrics.avgSuccessRate >= 80 ? "Good" : "Needs Attention"}
                    </Badge>
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${summaryMetrics.totalCost.toFixed(4)}</div>
                  <p className="text-xs text-muted-foreground">
                    Last {timeRange} days
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summaryMetrics.avgDuration}s</div>
                  <p className="text-xs text-muted-foreground">
                    Per evaluation
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Trends Chart */}
          <TrendsChart data={trendsData || []} isLoading={trendsLoading} />

          {/* Cost Analysis & Performance Comparison */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <CostBreakdownChart data={costData} isLoading={costLoading} />
            <div className="xl:col-span-1">
              <PerformanceComparisonTable data={performanceData || []} isLoading={performanceLoading} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}