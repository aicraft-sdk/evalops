import { useQuery } from '@tanstack/react-query'
import { useRoute } from 'wouter'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  ArrowLeft, 
  Activity, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  XCircle,
  BarChart3
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

interface EvaluatorUsage {
  totalExecutions: number
  successRate: number
  avgExecutionTime: number
  totalCost: number
  usageOverTime: {
    date: string
    executions: number
    successRate: number
    avgTime: number
    cost: number
  }[]
}

interface CustomEvaluator {
  id: string
  name: string
  description?: string
  version: string
  evaluatorType: string
  status: string
  tags: string[]
  isPublic: boolean
  createdAt: string
}

export default function CustomEvaluatorUsage() {
  const [, params] = useRoute('/custom-evaluators/:id/usage')
  const evaluatorId = params?.id
  const [timeRange, setTimeRange] = useState('30')

  // Fetch evaluator details
  const { data: evaluator } = useQuery<CustomEvaluator>({
    queryKey: ['/api/custom-evaluators', evaluatorId],
    queryFn: async () => {
      const response = await fetch(`/api/custom-evaluators/${evaluatorId}`)
      if (!response.ok) throw new Error('Failed to fetch evaluator')
      return (await response.json()) as CustomEvaluator
    },
    enabled: !!evaluatorId
  })

  // Fetch usage statistics
  const { data: usage, isLoading } = useQuery<EvaluatorUsage>({
    queryKey: ['/api/custom-evaluators', evaluatorId, 'usage', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/custom-evaluators/${evaluatorId}/usage?days=${timeRange}`)
      if (!response.ok) throw new Error('Failed to fetch usage statistics')
      return (await response.json()) as EvaluatorUsage
    },
    enabled: !!evaluatorId
  })

  if (!evaluatorId) {
    return <div>Invalid evaluator ID</div>
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-evaluator-usage">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild data-testid="button-back">
          <Link href="/custom-evaluators">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Evaluators
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-usage-title">
            {evaluator?.name || 'Evaluator'} Usage
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics and usage statistics
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Evaluator Info */}
      {evaluator && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {evaluator.name}
                  <Badge variant="outline">v{evaluator.version}</Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {evaluator.description || 'No description provided'}
                </CardDescription>
              </div>
              <Badge className={evaluator.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                {evaluator.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span> {evaluator.evaluatorType}
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span> {new Date(evaluator.createdAt).toLocaleDateString()}
              </div>
              {evaluator.isPublic && (
                <Badge variant="outline">Public</Badge>
              )}
              {evaluator.tags.length > 0 && (
                <div className="flex gap-1">
                  {evaluator.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Statistics */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : usage ? (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card data-testid="card-total-executions">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-executions">
                  {usage.totalExecutions.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last {timeRange} days
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-success-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-success-rate">
                  {(usage.successRate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.totalExecutions > 0 ? 
                    `${Math.round(usage.totalExecutions * usage.successRate)} successful` : 
                    'No executions yet'
                  }
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-execution-time">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Execution Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-execution-time">
                  {usage.avgExecutionTime.toFixed(0)}ms
                </div>
                <p className="text-xs text-muted-foreground">
                  Average response time
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-cost">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-cost">
                  ${usage.totalCost.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last {timeRange} days
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Over Time Chart */}
          {usage.usageOverTime && usage.usageOverTime.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Usage Over Time
                </CardTitle>
                <CardDescription>
                  Daily execution statistics for the last {timeRange} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {usage.usageOverTime.map((day, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded" data-testid={`usage-day-${index}`}>
                      <div className="flex-1">
                        <div className="font-medium">{new Date(day.date).toLocaleDateString()}</div>
                        <div className="text-sm text-muted-foreground">
                          {day.executions} executions
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-medium text-green-600">{(day.successRate * 100).toFixed(0)}%</div>
                          <div className="text-muted-foreground">Success</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{day.avgTime.toFixed(0)}ms</div>
                          <div className="text-muted-foreground">Avg Time</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">${day.cost.toFixed(4)}</div>
                          <div className="text-muted-foreground">Cost</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Usage Data</h3>
                <p className="text-muted-foreground">
                  This evaluator hasn't been used in the last {timeRange} days.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to Load Usage Data</h3>
            <p className="text-muted-foreground">
              There was an error loading the usage statistics for this evaluator.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}