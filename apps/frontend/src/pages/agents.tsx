import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Bot, ChevronRight, Power, PowerOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

const AGENTMD_PLACEHOLDER = `---
metadata:
  name: my-agent
  version: "1.0.0"
model:
  provider: openai
  model: gpt-4o
---
You are a helpful assistant.`;

export default function Agents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newAgent, setNewAgent] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    content: AGENTMD_PLACEHOLDER,
    tags: [] as string[],
    metadata: {},
  });

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

  const { data: agents, isLoading: agentsLoading } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    enabled: isAuthenticated,
  });

  const filteredAgents = agents?.filter((agent) =>
    searchTerm === "" ||
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

  const createMutation = useMutation({
    mutationFn: async (data: typeof newAgent) => {
      const response = await apiRequest("POST", "/api/agents", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setIsCreateDialogOpen(false);
      setNewAgent({
        name: "",
        version: "1.0.0",
        description: "",
        content: AGENTMD_PLACEHOLDER,
        tags: [],
        metadata: {},
      });
      toast({ title: "Agent created", description: "Your agent has been created successfully." });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message ?? "Failed to create agent",
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const response = await apiRequest("DELETE", `/api/agents/${agentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent deactivated" });
    },
  });

  if (!isAuthenticated || isLoading) return <div>Loading...</div>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Bot className="h-8 w-8" />
                Agents
              </h1>
              <p className="text-muted-foreground">
                Manage AgentMD-defined agents and their version history
              </p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Agent
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Agent</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Name</Label>
                      <Input
                        id="agent-name"
                        placeholder="my-agent"
                        value={newAgent.name}
                        onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-version">Version</Label>
                      <Input
                        id="agent-version"
                        placeholder="1.0.0"
                        value={newAgent.version}
                        onChange={(e) => setNewAgent({ ...newAgent, version: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-description">Description</Label>
                    <Input
                      id="agent-description"
                      placeholder="What does this agent do?"
                      value={newAgent.description}
                      onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-content">AgentMD Content</Label>
                    <Textarea
                      id="agent-content"
                      className="font-mono text-xs min-h-[300px]"
                      value={newAgent.content}
                      onChange={(e) => setNewAgent({ ...newAgent, content: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      YAML front-matter between --- delimiters, followed by the system prompt.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createMutation.mutate(newAgent)}
                      disabled={createMutation.isPending || !newAgent.name}
                    >
                      {createMutation.isPending ? "Creating..." : "Create Agent"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Agents Grid */}
          {agentsLoading ? (
            <div className="text-muted-foreground">Loading agents...</div>
          ) : filteredAgents.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No agents yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first AgentMD-defined agent to get started.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Agent
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map((agent) => (
                <Card key={agent.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                      </div>
                      <Badge variant={agent.active ? "default" : "secondary"}>
                        {agent.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>v{agent.version}</span>
                      {agent.modelProvider && (
                        <>
                          <span>•</span>
                          <span>{agent.modelProvider}/{agent.modelName}</span>
                        </>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                    {agent.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.tags.map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <Link href={`/agents/${agent.id}`}>
                        <Button variant="outline" size="sm">
                          View Details
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                      {agent.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivateMutation.mutate(agent.id)}
                          disabled={deactivateMutation.isPending}
                          title="Deactivate agent"
                        >
                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
