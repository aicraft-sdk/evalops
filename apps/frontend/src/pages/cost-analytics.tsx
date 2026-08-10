import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Activity,
  BarChart3,
  PieChart,
  Zap
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

interface CostData {
  providerId: string;
  providerName: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  averageCost: number;
  trend: 'up' | 'down' | 'stable';
}

interface ModelUsage {
  modelId: string;
  modelName: string;
  provider: string;
  cost: number;
  tokens: number;
  requests: number;
}

interface CostTrend {
  date: string;
  cost: number;
  provider: string;
}

const TIME_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },  
  { value: "90", label: "Last 90 days" },
];

const PROVIDER_COLORS = {
  openai: '#10B981',
  anthropic: '#3B82F6', 
  azure_openai: '#06B6D4',
  google: '#F59E0B',
  xai: '#8B5CF6',
};

export function CostAnalytics() {
  const [timeRange, setTimeRange] = useState("30");

  const { data: costData = [], isLoading } = useQuery<CostData[]>({
    queryKey: [`/api/analytics/cost-by-provider?days=${timeRange}`],
  });

  const { data: modelUsage = [] } = useQuery<ModelUsage[]>({
    queryKey: [`/api/analytics/model-usage?days=${timeRange}`],
  });

  const { data: costTrends = [] } = useQuery<CostTrend[]>({
    queryKey: [`/api/analytics/cost-trends?days=${timeRange}`],
  });

  const totalCost = costData.reduce((sum: number, item: CostData) => sum + item.totalCost, 0);
  const totalTokens = costData.reduce((sum: number, item: CostData) => sum + item.totalTokens, 0);
  const totalRequests = costData.reduce((sum: number, item: CostData) => sum + item.requestCount, 0);
  const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

  // Prepare chart data
  const pieChartData = costData.map((item: CostData) => ({
    name: item.providerName,
    value: item.totalCost,
    color: PROVIDER_COLORS[item.providerId as keyof typeof PROVIDER_COLORS] || '#8B5CF6',
  }));

  const barChartData = costData.map((item: CostData) => ({
    provider: item.providerName,
    cost: item.totalCost,
    requests: item.requestCount,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-spinner">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="cost-analytics-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Cost Analytics</h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Track AI provider costs and usage patterns across your organization
          </p>
        </div>
        
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value} data-testid={`option-${range.value}`}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="summary-cards">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-cost">
              ${totalCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Last {timeRange} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-tokens">
              {(totalTokens / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground">
              Across all providers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-requests">
              {totalRequests.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              API calls made
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Request</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="avg-cost-per-request">
              ${avgCostPerRequest.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per API call
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Cost by Provider - Pie Chart */}
        <Card data-testid="cost-by-provider-chart">
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="w-5 h-5 mr-2" />
              Cost Distribution
            </CardTitle>
            <CardDescription>
              Cost breakdown by AI provider
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Usage by Provider - Bar Chart */}
        <Card data-testid="usage-by-provider-chart">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Usage by Provider
            </CardTitle>
            <CardDescription>
              Cost and request volume comparison
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="provider" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    name === 'cost' ? `$${value.toFixed(2)}` : value.toLocaleString(),
                    name === 'cost' ? 'Cost' : 'Requests'
                  ]}
                />
                <Bar dataKey="cost" fill="#3B82F6" />
                <Bar dataKey="requests" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cost Trends */}
      {costTrends.length > 0 && (
        <Card data-testid="cost-trends-chart">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Cost Trends
            </CardTitle>
            <CardDescription>
              Daily cost trends over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={costTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']} />
                <Area type="monotone" dataKey="cost" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Provider Details */}
      <Card data-testid="provider-details">
        <CardHeader>
          <CardTitle>Provider Performance</CardTitle>
          <CardDescription>
            Detailed cost and usage metrics by provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {costData.map((provider: CostData) => (
              <div 
                key={provider.providerId} 
                className="flex items-center justify-between p-4 border rounded-lg"
                data-testid={`provider-details-${provider.providerId}`}
              >
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: PROVIDER_COLORS[provider.providerId as keyof typeof PROVIDER_COLORS] || '#8B5CF6' }}
                  />
                  <div>
                    <h4 className="font-medium" data-testid={`provider-name-${provider.providerId}`}>
                      {provider.providerName}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {provider.requestCount} requests • {(provider.totalTokens / 1000).toFixed(1)}K tokens
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="font-medium" data-testid={`provider-cost-${provider.providerId}`}>
                      ${provider.totalCost.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ${provider.averageCost.toFixed(4)}/req
                    </div>
                  </div>
                  
                  <Badge 
                    variant={provider.trend === 'up' ? 'destructive' : provider.trend === 'down' ? 'default' : 'secondary'}
                    data-testid={`provider-trend-${provider.providerId}`}
                  >
                    {provider.trend === 'up' ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : provider.trend === 'down' ? (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    ) : (
                      <Activity className="w-3 h-3 mr-1" />
                    )}
                    {provider.trend}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Usage Breakdown */}
      {modelUsage.length > 0 && (
        <Card data-testid="model-usage">
          <CardHeader>
            <CardTitle>Model Usage</CardTitle>
            <CardDescription>
              Cost breakdown by individual models
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {modelUsage.slice(0, 10).map((model: ModelUsage, index: number) => (
                <div 
                  key={model.modelId} 
                  className="flex items-center justify-between py-2 border-b"
                  data-testid={`model-usage-${index}`}
                >
                  <div>
                    <span className="font-medium" data-testid={`model-name-${index}`}>
                      {model.modelName}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({model.provider})
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium" data-testid={`model-cost-${index}`}>
                      ${model.cost.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {model.requests} requests
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}