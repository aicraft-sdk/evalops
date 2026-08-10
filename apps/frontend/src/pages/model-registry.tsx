import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Database, 
  GitBranch, 
  Trophy, 
  Clock, 
  DollarSign, 
  Zap,
  TrendingUp,
  Star,
  BarChart3,
  ExternalLink,
  Calendar,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

interface Model {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  contextWindow?: number;
  maxTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  isActive: boolean;
  metadata: Record<string, any>;
  latestVersion?: ModelVersion;
}

interface ModelVersion {
  id: string;
  version: string;
  releaseDate?: string;
  changeLog?: string;
  isActive: boolean;
  isDeprecated: boolean;
  deprecationNotice?: string;
  capabilities: string[];
  contextWindow?: number;
  maxTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  benchmarkScores: Record<string, number>;
}

interface ModelBenchmark {
  id: string;
  benchmarkName: string;
  score: number;
  maxScore: number;
  scoreType: string;
  testDate: string;
  testConditions: Record<string, any>;
}

interface Provider {
  id: string;
  name: string;
}

export function ModelRegistry() {
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data: models = [], isLoading } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
  });

  const { data: modelVersions = [] } = useQuery<ModelVersion[]>({
    queryKey: [`/api/models/${selectedModel}/versions`],
    enabled: !!selectedModel,
  });

  const { data: modelBenchmarks = [] } = useQuery<ModelBenchmark[]>({
    queryKey: [`/api/models/${selectedModel}/benchmarks`],
    enabled: !!selectedModel,
  });

  const filteredModels = selectedProvider === "all" 
    ? models 
    : models.filter((model: Model) => model.providerId === selectedProvider);

  const getCapabilityIcon = (capability: string) => {
    switch (capability) {
      case 'text_generation': return '✍️';
      case 'image_analysis': return '🖼️';
      case 'function_calling': return '🔧';
      case 'json_mode': return '📋';
      case 'streaming': return '⚡';
      default: return '🔹';
    }
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'openai': return '🤖';
      case 'anthropic': return '🧠';
      case 'azure_openai': return '☁️';
      case 'google': return '🔍';
      case 'xai': return '⚡';
      default: return '🔧';
    }
  };

  const getBenchmarkColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-spinner">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="model-registry-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Model Registry</h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Centralized catalog of AI models with version tracking and performance benchmarks
          </p>
        </div>
        
        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
          <SelectTrigger className="w-48" data-testid="select-provider-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="option-all">All Providers</SelectItem>
            {providers.map((provider: any) => (
              <SelectItem 
                key={provider.id} 
                value={provider.id}
                data-testid={`option-${provider.id}`}
              >
                {getProviderIcon(provider.id)} {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model Grid */}
      {!selectedModel ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="models-grid">
          {filteredModels.map((model: Model) => (
            <Card 
              key={model.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedModel(model.id)}
              data-testid={`model-card-${model.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{getProviderIcon(model.providerId)}</span>
                    <div>
                      <CardTitle className="text-lg" data-testid={`model-name-${model.id}`}>
                        {model.displayName}
                      </CardTitle>
                      <CardDescription data-testid={`model-provider-${model.id}`}>
                        {model.name}
                      </CardDescription>
                    </div>
                  </div>
                  {!model.isActive && (
                    <Badge variant="secondary" data-testid={`model-inactive-${model.id}`}>
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {model.description && (
                  <p className="text-sm text-muted-foreground" data-testid={`model-description-${model.id}`}>
                    {model.description}
                  </p>
                )}

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1" data-testid={`model-capabilities-${model.id}`}>
                  {model.capabilities.slice(0, 3).map((capability) => (
                    <Badge key={capability} variant="outline" className="text-xs">
                      {getCapabilityIcon(capability)} {capability.replace('_', ' ')}
                    </Badge>
                  ))}
                  {model.capabilities.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{model.capabilities.length - 3} more
                    </Badge>
                  )}
                </div>

                {/* Model Specs */}
                <div className="grid grid-cols-2 gap-4 text-sm" data-testid={`model-specs-${model.id}`}>
                  {model.contextWindow && (
                    <div className="flex items-center space-x-1">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      <span>{(model.contextWindow / 1000).toFixed(0)}K context</span>
                    </div>
                  )}
                  {model.inputCostPer1k && (
                    <div className="flex items-center space-x-1">
                      <DollarSign className="w-3 h-3 text-muted-foreground" />
                      <span>${model.inputCostPer1k.toFixed(3)}/1K</span>
                    </div>
                  )}
                </div>

                {/* Latest Version */}
                {model.latestVersion && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center space-x-1">
                      <GitBranch className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm" data-testid={`model-version-${model.id}`}>
                        v{model.latestVersion.version}
                      </span>
                    </div>
                    {model.latestVersion.isDeprecated && (
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Model Details View */
        <div className="space-y-6" data-testid="model-details-view">
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              onClick={() => setSelectedModel(null)}
              data-testid="button-back-to-models"
            >
              ← Back to Models
            </Button>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="versions" data-testid="tab-versions">Versions</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6" data-testid="tab-content-overview">
              {/* Model Overview Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Context Window</div>
                        <div className="text-2xl font-bold">
                          {models.find((m: Model) => m.id === selectedModel)?.contextWindow || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Input Cost</div>
                        <div className="text-2xl font-bold">
                          ${models.find((m: Model) => m.id === selectedModel)?.inputCostPer1k?.toFixed(3) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <GitBranch className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Versions</div>
                        <div className="text-2xl font-bold">{modelVersions.length}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Trophy className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Benchmarks</div>
                        <div className="text-2xl font-bold">{modelBenchmarks.length}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="versions" className="space-y-4" data-testid="tab-content-versions">
              {modelVersions.map((version: ModelVersion) => (
                <Card key={version.id} data-testid={`version-card-${version.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <GitBranch className="w-4 h-4" />
                        <CardTitle className="text-lg">Version {version.version}</CardTitle>
                        {version.isActive && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        {version.isDeprecated && (
                          <Badge variant="destructive">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Deprecated
                          </Badge>
                        )}
                      </div>
                      {version.releaseDate && (
                        <div className="flex items-center text-muted-foreground">
                          <Calendar className="w-4 h-4 mr-1" />
                          {new Date(version.releaseDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {version.changeLog && (
                      <p className="text-sm mb-4">{version.changeLog}</p>
                    )}
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Context:</span> {version.contextWindow?.toLocaleString() || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Max Tokens:</span> {version.maxTokens?.toLocaleString() || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Input Cost:</span> ${version.inputCostPer1k?.toFixed(3) || 'N/A'}/1K
                      </div>
                    </div>

                    {version.deprecationNotice && (
                      <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                        <p className="text-sm text-yellow-800">{version.deprecationNotice}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="benchmarks" className="space-y-4" data-testid="tab-content-benchmarks">
              <div className="grid gap-4">
                {modelBenchmarks.map((benchmark: ModelBenchmark) => (
                  <Card key={benchmark.id} data-testid={`benchmark-card-${benchmark.id}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Trophy className="w-4 h-4" />
                          <CardTitle className="text-lg">{benchmark.benchmarkName}</CardTitle>
                        </div>
                        <Badge variant="outline">{benchmark.scoreType}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold">
                          <span className={getBenchmarkColor(benchmark.score, benchmark.maxScore)}>
                            {benchmark.score}
                          </span>
                          <span className="text-muted-foreground">/{benchmark.maxScore}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(benchmark.testDate).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <Progress 
                        value={(benchmark.score / benchmark.maxScore) * 100}
                        className="mb-3"
                      />
                      
                      <div className="text-sm text-muted-foreground">
                        Score: {((benchmark.score / benchmark.maxScore) * 100).toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {modelBenchmarks.length === 0 && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-xl font-semibold mb-2">No Benchmarks Available</h3>
                      <p className="text-muted-foreground">
                        Benchmark data for this model is not yet available.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {models.length === 0 && (
        <Card data-testid="empty-state">
          <CardContent className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Models Registered</h3>
            <p className="text-muted-foreground mb-4">
              Models will appear here as they are registered through your AI providers.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}