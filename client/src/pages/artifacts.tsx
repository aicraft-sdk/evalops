import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, FileText, Workflow, Database } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Artifacts() {
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
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: prompts } = useQuery<any[]>({
    queryKey: ["/api/prompts"],
    enabled: isAuthenticated,
  });

  const { data: flows } = useQuery<any[]>({
    queryKey: ["/api/flows"],
    enabled: isAuthenticated,
  });

  const { data: datasets } = useQuery<any[]>({
    queryKey: ["/api/datasets"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-artifacts-title">Artifacts</h1>
              <p className="text-muted-foreground">Manage prompts, flows, and datasets</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search artifacts..." 
                  className="pl-10 w-64"
                  data-testid="input-search-artifacts"
                />
              </div>
              <Button data-testid="button-create-artifact">
                <Plus className="w-4 h-4 mr-2" />
                Create Artifact
              </Button>
            </div>
          </div>
        </header>
        
        <div className="p-6">
          <Tabs defaultValue="prompts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="prompts" data-testid="tab-prompts">
                <FileText className="w-4 h-4 mr-2" />
                Prompts
              </TabsTrigger>
              <TabsTrigger value="flows" data-testid="tab-flows">
                <Workflow className="w-4 h-4 mr-2" />
                Flows
              </TabsTrigger>
              <TabsTrigger value="datasets" data-testid="tab-datasets">
                <Database className="w-4 h-4 mr-2" />
                Datasets
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="prompts" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {prompts?.map((prompt: any) => (
                  <Card key={prompt.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{prompt.name}</CardTitle>
                        <Badge variant="secondary">{prompt.version}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {prompt.content}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(prompt.createdAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                )) || (
                  <Card className="col-span-full">
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No prompts found</p>
                        <Button className="mt-4" data-testid="button-create-first-prompt">
                          Create your first prompt
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="flows" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {flows?.map((flow: any) => (
                  <Card key={flow.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{flow.name}</CardTitle>
                        <Badge variant="secondary">{flow.version}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">
                        Flow ID: {flow.flowId}
                      </p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Workspace: {flow.workspaceId}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(flow.createdAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                )) || (
                  <Card className="col-span-full">
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Workflow className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No flows found</p>
                        <Button className="mt-4" data-testid="button-create-first-flow">
                          Create your first flow
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="datasets" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {datasets?.map((dataset: any) => (
                  <Card key={dataset.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{dataset.name}</CardTitle>
                        <Badge variant="secondary">{dataset.version}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">
                        {dataset.description}
                      </p>
                      <p className="text-sm font-medium mb-3">
                        {dataset.sampleCount} samples
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(dataset.createdAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                )) || (
                  <Card className="col-span-full">
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No datasets found</p>
                        <Button className="mt-4" data-testid="button-create-first-dataset">
                          Create your first dataset
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
