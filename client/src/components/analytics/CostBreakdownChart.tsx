import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CostBreakdownData {
  byEvalSpec: {
    name: string;
    totalCost: number;
    avgCost: number;
    runCount: number;
  }[];
  byModel: {
    model: string;
    totalCost: number;
    runCount: number;
  }[];
}

interface CostBreakdownChartProps {
  data: CostBreakdownData | null;
  isLoading?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

export function CostBreakdownChart({ data, isLoading }: CostBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading cost data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.byEvalSpec.length === 0 && data.byModel.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            No cost data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">Detailed cost breakdown by evaluation specs and models</p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="by-spec" className="w-full">
          <TabsList>
            <TabsTrigger value="by-spec">By Evaluation Spec</TabsTrigger>
            <TabsTrigger value="by-model">By Model</TabsTrigger>
          </TabsList>
          
          <TabsContent value="by-spec" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Total Cost Distribution</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.byEvalSpec}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="totalCost"
                    >
                      {data.byEvalSpec.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Total Cost']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Bar Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Average Cost per Run</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.byEvalSpec}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Avg Cost']} />
                    <Bar dataKey="avgCost" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="by-model" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Model Pie Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Cost by Model</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.byModel}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ model, percent }) => `${model}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="totalCost"
                    >
                      {data.byModel.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Total Cost']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Model Bar Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Runs by Model</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.byModel}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="runCount" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}