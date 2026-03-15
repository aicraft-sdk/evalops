import { Card, CardContent } from "@/components/ui/card";
import { Zap, CheckCircle, DollarSign, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsGridProps {
  stats?: {
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  };
  isLoading?: boolean;
}

export function StatsGrid({ stats, isLoading }: StatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-4" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = [
    {
      title: "Active Runs",
      value: stats?.activeRuns?.toString() || "0",
      icon: Zap,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      trend: "+2 from yesterday",
      trendIcon: TrendingUp,
      trendColor: "text-success",
      testId: "stat-active-runs"
    },
    {
      title: "Pass Rate",
      value: `${stats?.passRate?.toFixed(1) || "0.0"}%`,
      icon: CheckCircle,
      iconColor: "text-success",
      iconBg: "bg-success/10",
      trend: "+1.2% from last week",
      trendIcon: TrendingUp,
      trendColor: "text-success",
      testId: "stat-pass-rate"
    },
    {
      title: "Avg Cost",
      value: `$${stats?.avgCost?.toFixed(2) || "0.00"}`,
      icon: DollarSign,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      trend: "+15.3% from baseline",
      trendIcon: TrendingUp,
      trendColor: "text-destructive",
      testId: "stat-avg-cost"
    },
    {
      title: "P95 Latency",
      value: `${stats?.p95Latency?.toFixed(1) || "0.0"}s`,
      icon: Clock,
      iconColor: "text-muted-foreground",
      iconBg: "bg-muted/10",
      trend: "-200ms from last month",
      trendIcon: TrendingDown,
      trendColor: "text-success",
      testId: "stat-p95-latency"
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsData.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold" data-testid={stat.testId}>{stat.value}</p>
              </div>
              <div className={`w-12 h-12 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <stat.trendIcon className={`w-4 h-4 mr-1 ${stat.trendColor}`} />
              <span className={`font-medium ${stat.trendColor}`}>
                {stat.trend.split(" ")[0]}
              </span>
              <span className="text-muted-foreground ml-1">
                {stat.trend.split(" ").slice(1).join(" ")}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
