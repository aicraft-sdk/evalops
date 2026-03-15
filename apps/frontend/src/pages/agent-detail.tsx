import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bot, Clock, GitBranch, Play } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: agent, isLoading: agentLoading } = useQuery<any>({
    queryKey: [`/api/agents/${id}`],
    enabled: isAuthenticated && !!id,
  });

  const { data: versions } = useQuery<any[]>({
    queryKey: [`/api/agents/${id}/versions`],
    enabled: isAuthenticated && !!id,
  });

  const { data: runs } = useQuery<any[]>({
    queryKey: [`/api/runs`, { agentId: id }],
    enabled: isAuthenticated && !!id,
  });

  if (!isAuthenticated || isLoading) return <div>Loading...</div>;

  if (agentLoading) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div>Loading agent details...</div>
        </main>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div>Agent not found</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/agents">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Agents
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <Bot className="h-7 w-7" />
                <div>
                  <h1 className="text-2xl font-bold">{agent.name}</h1>
                  <p className="text-muted-foreground text-sm">
                    {agent.modelProvider && `${agent.modelProvider} / ${agent.modelName}`}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={agent.active ? "default" : "secondary"}>
                {agent.active ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="outline">v{agent.version}</Badge>
            </div>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="versions">
                <GitBranch className="h-4 w-4 mr-1" />
                Versions ({versions?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="runs">
                <Play className="h-4 w-4 mr-1" />
                Runs ({runs?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Agent Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ID</span>
                      <span className="font-mono text-xs">{agent.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span>{agent.version}</span>
                    </div>
                    {agent.description && (
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="text-muted-foreground">Description</span>
                        <span>{agent.description}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={agent.active ? "default" : "secondary"} className="text-xs">
                        {agent.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Created</span>
                      <span>{new Date(agent.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Model Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Provider</span>
                      <span>{agent.modelProvider ?? "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Model</span>
                      <span>{agent.modelName ?? "—"}</span>
                    </div>
                    {agent.tags?.length > 0 && (
                      <div className="flex flex-col gap-1 text-sm">
                        <span className="text-muted-foreground">Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {agent.tags.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* AgentMD Content */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AgentMD Source</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
                    {agent.content}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Versions Tab */}
            <TabsContent value="versions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Version History</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Every content change creates an immutable version snapshot.
                  </p>
                </CardHeader>
                <CardContent>
                  {!versions || versions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No version history available.</p>
                  ) : (
                    <div className="space-y-3">
                      {versions.map((version: any) => (
                        <div key={version.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <GitBranch className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">v{version.version}</span>
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(version.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {version.changeNotes && (
                            <p className="text-sm text-muted-foreground">{version.changeNotes}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1 font-mono">
                            {version.versionHash.slice(0, 16)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Runs Tab */}
            <TabsContent value="runs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evaluation Runs</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Runs that used this agent as their target.
                  </p>
                </CardHeader>
                <CardContent>
                  {!runs || runs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No runs for this agent yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {runs.map((run: any) => (
                        <div key={run.id} className="border rounded-lg p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{run.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                run.decision === "pass" ? "default" :
                                run.decision === "fail" ? "destructive" : "secondary"
                              }
                            >
                              {run.decision ?? run.status}
                            </Badge>
                            <Link href={`/runs/${run.id}`}>
                              <Button variant="outline" size="sm">View</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
