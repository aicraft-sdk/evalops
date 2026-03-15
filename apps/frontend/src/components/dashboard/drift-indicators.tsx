import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DriftIndicatorsProps {
  stats?: {
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  };
  isLoading?: boolean;
}

export function DriftIndicators({ stats, isLoading }: DriftIndicatorsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-6 py-4 border-b border-border">
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Calculate real drift data based on current stats vs baseline expectations
  const calculateDriftData = () => {
    const baselineCost = 0.015; // Expected baseline cost
    const baselineLatency = 2.5; // Expected baseline latency in seconds  
    const baselinePassRate = 85; // Expected baseline pass rate %

    const currentCost = stats?.avgCost || 0;
    const currentLatency = stats?.p95Latency || 0;
    const currentPassRate = stats?.passRate || 0;

    const costDrift = currentCost > 0 ? ((currentCost - baselineCost) / baselineCost) * 100 : 0;
    const latencyDrift = currentLatency > 0 ? ((currentLatency - baselineLatency) / baselineLatency) * 100 : 0;
    const qualityDrift = currentPassRate > 0 ? ((currentPassRate - baselinePassRate) / baselinePassRate) * 100 : 0;

    return [
      {
        title: "Cost Reliability",
        description: `${costDrift >= 0 ? '+' : ''}${costDrift.toFixed(1)}% vs baseline`,
        value: `$${baselineCost.toFixed(3)} → $${currentCost.toFixed(3)}`,
        icon: costDrift > 10 ? TrendingUp : costDrift < -10 ? TrendingDown : Activity,
        iconColor: costDrift > 10 ? "text-warning" : costDrift < -10 ? "text-success" : "text-muted-foreground",
        iconBg: costDrift > 10 ? "bg-warning/10" : costDrift < -10 ? "bg-success/10" : "bg-muted/10",
        borderColor: costDrift > 10 ? "border-warning/20" : costDrift < -10 ? "border-success/20" : "border-border",
        bgColor: costDrift > 10 ? "bg-warning/5" : costDrift < -10 ? "bg-success/5" : "bg-muted/5",
        testId: "drift-cost"
      },
      {
        title: "Latency Reliability", 
        description: `${latencyDrift >= 0 ? '+' : ''}${latencyDrift.toFixed(1)}% vs baseline`,
        value: `${baselineLatency.toFixed(1)}s → ${currentLatency.toFixed(1)}s`,
        icon: latencyDrift > 20 ? TrendingUp : latencyDrift < -20 ? TrendingDown : Activity,
        iconColor: latencyDrift > 20 ? "text-warning" : latencyDrift < -20 ? "text-success" : "text-muted-foreground",
        iconBg: latencyDrift > 20 ? "bg-warning/10" : latencyDrift < -20 ? "bg-success/10" : "bg-muted/10", 
        borderColor: latencyDrift > 20 ? "border-warning/20" : latencyDrift < -20 ? "border-success/20" : "border-border",
        bgColor: latencyDrift > 20 ? "bg-warning/5" : latencyDrift < -20 ? "bg-success/5" : "bg-muted/5",
        testId: "drift-latency"
      },
      {
        title: "Quality Reliability",
        description: `${qualityDrift >= 0 ? '+' : ''}${qualityDrift.toFixed(1)}% vs baseline`,
        value: `${baselinePassRate.toFixed(1)}% → ${currentPassRate.toFixed(1)}%`,
        icon: qualityDrift < -5 ? TrendingDown : qualityDrift > 5 ? TrendingUp : Activity,
        iconColor: qualityDrift < -5 ? "text-destructive" : qualityDrift > 5 ? "text-success" : "text-muted-foreground",
        iconBg: qualityDrift < -5 ? "bg-destructive/10" : qualityDrift > 5 ? "bg-success/10" : "bg-muted/10",
        borderColor: qualityDrift < -5 ? "border-destructive/20" : qualityDrift > 5 ? "border-success/20" : "border-border", 
        bgColor: qualityDrift < -5 ? "bg-destructive/5" : qualityDrift > 5 ? "bg-success/5" : "bg-muted/5",
        testId: "drift-quality"
      },
    ];
  };

  const driftData = calculateDriftData();

  return (
    <Card>
      <CardHeader className="px-6 py-4 border-b border-border">
        <CardTitle className="text-lg font-semibold">Drift Indicators</CardTitle>
        <p className="text-sm text-muted-foreground">Performance changes vs baselines</p>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {driftData.map((drift) => (
          <div 
            key={drift.title}
            className={`flex items-center justify-between p-4 ${drift.bgColor} border ${drift.borderColor} rounded-lg`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 ${drift.iconBg} rounded-full flex items-center justify-center`}>
                <drift.icon className={`w-4 h-4 ${drift.iconColor}`} />
              </div>
              <div>
                <p className="font-medium" data-testid={drift.testId}>
                  {drift.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {drift.description}
                </p>
              </div>
            </div>
            <span className={`text-sm font-medium ${drift.iconColor}`}>
              {drift.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
