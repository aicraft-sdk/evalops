import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Archive, FileText, Settings, Eye, Edit, Filter, Tag, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Prompts() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);

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

  const { data: prompts, isLoading: promptsLoading } = useQuery<any[]>({
    queryKey: ["/api/prompts"],
    enabled: isAuthenticated,
  });

  // Filter prompts based on category and search term
  const filteredPrompts = prompts?.filter(prompt => {
    const matchesCategory = selectedCategory === 'all' || prompt.category === selectedCategory;
    const matchesSearch = searchTerm === '' || 
      prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  }) || [];

  const { data: flows } = useQuery<any[]>({
    queryKey: ["/api/flows"],
    enabled: isAuthenticated,
  });

  const { data: availableTemplates } = useQuery<any[]>({
    queryKey: ["/api/prompt-templates/judge"],
    enabled: isAuthenticated,
  });

  const createPromptMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/prompts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Prompt created",
        description: "Your prompt has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create prompt",
        variant: "destructive",
      });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; content: string; category: string; description?: string }) => {
      const response = await apiRequest("PUT", `/api/prompts/${data.id}`, {
        name: data.name,
        content: data.content,
        category: data.category,
        description: data.description
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      setIsEditDialogOpen(false);
      setEditingPrompt(null);
      toast({
        title: "Prompt updated",
        description: "Your prompt has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update prompt",
        variant: "destructive",
      });
    },
  });

  const seedTemplatesMutation = useMutation({
    mutationFn: async (templateIds?: string[]) => {
      const response = await apiRequest("POST", "/api/prompt-templates/seed", { templateIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      toast({
        title: "Templates Added",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to seed templates",
        variant: "destructive",
      });
    },
  });

  const deletePromptMutation = useMutation({
    mutationFn: async (promptId: string) => {
      const response = await apiRequest("DELETE", `/api/prompts/${promptId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      toast({
        title: "Prompt Deleted",
        description: "The prompt has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete prompt",
        variant: "destructive",
      });
    },
  });

  const handleCreatePrompt = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createPromptMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      content: formData.get("content"),
      category: formData.get("category") || 'general',
    });
  };

  const handleEditPrompt = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPrompt) return;
    
    const formData = new FormData(e.currentTarget);
    
    updatePromptMutation.mutate({
      id: editingPrompt.id,
      name: formData.get("name") as string,
      content: formData.get("content") as string,
      category: formData.get("category") as string,
      description: formData.get("description") as string || "",
    });
  };

  const handleSeedTemplates = () => {
    setIsTemplateDialogOpen(true);
  };

  const handleImportSelectedTemplates = () => {
    seedTemplatesMutation.mutate(selectedTemplates.length > 0 ? selectedTemplates : undefined);
    setIsTemplateDialogOpen(false);
    setSelectedTemplates([]);
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev => 
      prev.includes(templateId) 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

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
              <h1 className="text-2xl font-semibold" data-testid="text-prompts-title">Prompts & Flows</h1>
              <p className="text-muted-foreground">Manage prompt templates and execution flows</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search prompts..." 
                  className="pl-10 w-64"
                  data-testid="input-search-prompts"
                />
              </div>
              <Button 
                variant="outline"
                onClick={handleSeedTemplates}
                disabled={seedTemplatesMutation.isPending}
                data-testid="button-seed-templates"
              >
                <Tag className="w-4 h-4 mr-2" />
                {seedTemplatesMutation.isPending ? "Seeding..." : "Add Judge Templates"}
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-prompt">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Prompt
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Prompt</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreatePrompt} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Customer Support Assistant"
                        required
                        data-testid="input-prompt-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Select name="category" defaultValue="general">
                        <SelectTrigger data-testid="select-prompt-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="customer_support">Customer Support</SelectItem>
                          <SelectItem value="llm_judge">LLM Judge</SelectItem>
                          <SelectItem value="evaluation">Evaluation</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Helpful customer support responses"
                        data-testid="textarea-prompt-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="content">Prompt Content</Label>
                      <Textarea
                        id="content"
                        name="content"
                        placeholder="You are a helpful customer support assistant. Provide clear, concise answers to customer questions. Input: {input}"
                        className="min-h-[150px]"
                        required
                        data-testid="textarea-prompt-content"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createPromptMutation.isPending}>
                        {createPromptMutation.isPending ? "Creating..." : "Create Prompt"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Edit Prompt Dialog */}
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Edit Prompt</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleEditPrompt} className="space-y-4">
                    <div>
                      <Label htmlFor="edit-name">Name</Label>
                      <Input
                        id="edit-name"
                        name="name"
                        defaultValue={editingPrompt?.name || ""}
                        required
                        data-testid="input-edit-prompt-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-category">Category</Label>
                      <Select name="category" defaultValue={editingPrompt?.category || "general"}>
                        <SelectTrigger data-testid="select-edit-prompt-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="customer_support">Customer Support</SelectItem>
                          <SelectItem value="llm_judge">LLM Judge</SelectItem>
                          <SelectItem value="evaluation">Evaluation</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        name="description"
                        defaultValue={editingPrompt?.description || ""}
                        data-testid="textarea-edit-prompt-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-content">Prompt Content</Label>
                      <Textarea
                        id="edit-content"
                        name="content"
                        defaultValue={editingPrompt?.content || ""}
                        className="min-h-[150px]"
                        required
                        data-testid="textarea-edit-prompt-content"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updatePromptMutation.isPending}>
                        {updatePromptMutation.isPending ? "Updating..." : "Update Prompt"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-8">
          {/* Prompts Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Prompts
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search prompts..." 
                    className="pl-10 w-48"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-prompts-section"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40" data-testid="select-category-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="customer_support">Customer Support</SelectItem>
                    <SelectItem value="llm_judge">LLM Judge</SelectItem>
                    <SelectItem value="evaluation">Evaluation</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {promptsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="h-3 bg-muted rounded"></div>
                        <div className="h-3 bg-muted rounded w-4/5"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredPrompts && filteredPrompts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPrompts.map((prompt) => (
                  <Card key={prompt.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="w-5 h-5 text-green-600" />
                          {prompt.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={prompt.category === 'llm_judge' ? 'default' : 'secondary'}>
                            <Tag className="w-3 h-3 mr-1" />
                            {prompt.category === 'llm_judge' ? 'LLM Judge' : 
                             prompt.category === 'evaluation' ? 'Evaluation' :
                             prompt.category === 'system' ? 'System' :
                             prompt.category === 'customer_support' ? 'Customer Support' : 'General'}
                          </Badge>
                          <Badge variant="outline">v{prompt.version || '1.0'}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{prompt.description}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground mb-3">
                        <p className="truncate">{prompt.content}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span>Created {new Date(prompt.createdAt).toLocaleDateString()}</span>
                        <Badge variant="outline">Prompt</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPrompt(prompt);
                            setIsDetailDialogOpen(true);
                          }}
                          data-testid={`button-view-prompt-${prompt.id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingPrompt(prompt);
                            setIsEditDialogOpen(true);
                          }}
                          data-testid={`button-edit-prompt-${prompt.id}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => deletePromptMutation.mutate(prompt.id)}
                          disabled={deletePromptMutation.isPending}
                          data-testid={`button-delete-prompt-${prompt.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {deletePromptMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No prompts yet</p>
              </div>
            )}
          </section>

          {/* Flows Section */}
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Flows
            </h2>
            {flows && flows.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {flows.map((flow) => (
                  <Card key={flow.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Settings className="w-5 h-5 text-purple-600" />
                          {flow.name}
                        </CardTitle>
                        <Badge variant="secondary">v{flow.version || '1.0'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{flow.description}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Created {new Date(flow.createdAt).toLocaleDateString()}</span>
                        <Badge variant="outline">Flow</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No flows yet</p>
              </div>
            )}
          </section>
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                {selectedPrompt?.name}
              </DialogTitle>
              <DialogDescription>
                Prompt details and content
              </DialogDescription>
            </DialogHeader>
            {selectedPrompt && (
              <div className="space-y-4 overflow-auto">
                <div>
                  <Label className="text-sm font-medium">Description</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPrompt.description || 'No description provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Prompt Content</Label>
                  <div className="mt-2 max-h-60 overflow-auto border rounded-md p-3 bg-muted">
                    <pre className="text-sm whitespace-pre-wrap">
                      {selectedPrompt.content}
                    </pre>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Version</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    v{selectedPrompt.version || '1.0'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Created</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(selectedPrompt.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Template Import Dialog */}
        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Import Judge Templates</DialogTitle>
              <DialogDescription>
                Select which LLM judge templates you want to add to your prompt library
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 overflow-auto max-h-[60vh]">
              {availableTemplates && availableTemplates.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTemplates(availableTemplates.map(t => t.name))}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTemplates([])}
                    >
                      Clear All
                    </Button>
                  </div>
                  {availableTemplates.map((template) => (
                    <div key={template.name} className="flex items-start space-x-3 p-4 border rounded-lg">
                      <input
                        type="checkbox"
                        checked={selectedTemplates.includes(template.name)}
                        onChange={() => toggleTemplate(template.name)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                        <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                          {template.content.slice(0, 150)}...
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No templates available</p>
              )}
            </div>
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleImportSelectedTemplates}
                disabled={seedTemplatesMutation.isPending || selectedTemplates.length === 0}
              >
                {seedTemplatesMutation.isPending ? "Importing..." : `Import ${selectedTemplates.length} Template${selectedTemplates.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}