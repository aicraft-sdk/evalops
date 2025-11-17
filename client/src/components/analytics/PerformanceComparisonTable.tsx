import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface PerformanceData {
  id: string;
  name: string;
  model: string;
  totalRuns: number;
  successRate: number;
  passRate: number;
  avgCost: number;
  avgDuration: number;
}

interface PerformanceComparisonTableProps {
  data: PerformanceData[];
  isLoading?: boolean;
}

export function PerformanceComparisonTable({ data, isLoading }: PerformanceComparisonTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading performance data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No performance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSuccessRateBadge = (rate: number) => {
    if (rate >= 90) return "bg-green-100 text-green-800";
    if (rate >= 70) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getPassRateBadge = (rate: number) => {
    if (rate >= 80) return "bg-green-100 text-green-800";
    if (rate >= 60) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(4)}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Comparison</CardTitle>
        <p className="text-sm text-muted-foreground">Compare evaluation specs across key performance metrics</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-medium">Evaluation Spec</th>
                <th className="text-left p-4 font-medium">Model</th>
                <th className="text-center p-4 font-medium">Total Runs</th>
                <th className="text-center p-4 font-medium">Success Rate</th>
                <th className="text-center p-4 font-medium">Pass Rate</th>
                <th className="text-right p-4 font-medium">Avg Cost</th>
                <th className="text-right p-4 font-medium">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.map((spec, index) => (
                <tr key={spec.id} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                  <td className="p-4">
                    <div>
                      <div className="font-medium">{spec.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {spec.id.slice(0, 8)}</div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline">{spec.model}</Badge>
                  </td>
                  <td className="text-center p-4">
                    <span className="font-mono">{spec.totalRuns}</span>
                  </td>
                  <td className="text-center p-4">
                    <Badge className={getSuccessRateBadge(spec.successRate)}>
                      {spec.successRate}%
                    </Badge>
                  </td>
                  <td className="text-center p-4">
                    <Badge className={getPassRateBadge(spec.passRate)}>
                      {spec.passRate}%
                    </Badge>
                  </td>
                  <td className="text-right p-4">
                    <span className="font-mono">{formatCurrency(spec.avgCost)}</span>
                  </td>
                  <td className="text-right p-4">
                    <span className="font-mono">{formatDuration(spec.avgDuration)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.length}</div>
            <div className="text-xs text-muted-foreground">Eval Specs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(data.reduce((sum, spec) => sum + spec.successRate, 0) / data.length)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {Math.round(data.reduce((sum, spec) => sum + spec.passRate, 0) / data.length)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Pass Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(data.reduce((sum, spec) => sum + spec.avgCost, 0) / data.length)}
            </div>
            <div className="text-xs text-muted-foreground">Avg Cost</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}