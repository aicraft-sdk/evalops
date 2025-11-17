import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Database, Upload, FileText, Eye, Edit, Trash } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Datasets() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

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

  const { data: datasets, isLoading: datasetsLoading } = useQuery<any[]>({
    queryKey: ["/api/datasets"],
    enabled: isAuthenticated,
  });

  const { data: datasetSamples } = useQuery<any[]>({
    queryKey: ["/api/datasets", selectedDataset?.id, "samples"],
    enabled: !!selectedDataset?.id && isDetailDialogOpen,
  });

  const createDatasetMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/datasets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Dataset created",
        description: "Your dataset has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create dataset",
        variant: "destructive",
      });
    },
  });

  const handleCreateDataset = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    let samples = [];
    try {
      samples = JSON.parse(formData.get("samples") as string);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please provide valid JSON for the dataset samples.",
        variant: "destructive",
      });
      return;
    }

    createDatasetMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      samples,
    });
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
              <h1 className="text-2xl font-semibold" data-testid="text-datasets-title">Datasets</h1>
              <p className="text-muted-foreground">Manage evaluation datasets and test cases</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search datasets..." 
                  className="pl-10 w-64"
                  data-testid="input-search-datasets"
                />
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-dataset">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Dataset
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Dataset</DialogTitle>
                    <DialogDescription>
                      Create a new dataset with test cases for evaluation.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateDataset} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Customer Support Q&A"
                        required
                        data-testid="input-dataset-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Sample customer support questions and answers"
                        data-testid="textarea-dataset-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="samples">Dataset Samples (JSON)</Label>
                      <Textarea
                        id="samples"
                        name="samples"
                        placeholder={`[
  {
    "input": "How do I reset my password?",
    "expected_output": "Go to Settings > Security > Reset Password and follow the instructions."
  },
  {
    "input": "What are your business hours?",
    "expected_output": "We're open Monday-Friday 9 AM to 6 PM EST."
  }
]`}
                        className="min-h-[200px] font-mono text-sm"
                        required
                        data-testid="textarea-dataset-samples"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createDatasetMutation.isPending}>
                        {createDatasetMutation.isPending ? "Creating..." : "Create Dataset"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <div className="p-6">
          {datasetsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
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
          ) : datasets && datasets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {datasets.map((dataset) => (
                <Card key={dataset.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="w-5 h-5 text-blue-600" />
                        {dataset.name}
                      </CardTitle>
                      <Badge variant="secondary">{dataset.sampleCount || 0} samples</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{dataset.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                      <span>Created {new Date(dataset.createdAt).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{dataset.storageUrl ? 'Uploaded' : 'Empty'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedDataset(dataset);
                          setIsDetailDialogOpen(true);
                        }}
                        data-testid={`button-view-dataset-${dataset.id}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          toast({
                            title: "Coming Soon",
                            description: "Dataset editing will be available soon",
                          });
                        }}
                        data-testid={`button-edit-dataset-${dataset.id}`}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">No datasets yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first dataset</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Dataset
              </Button>
            </div>
          )}
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                {selectedDataset?.name}
              </DialogTitle>
              <DialogDescription>
                Dataset details and samples
              </DialogDescription>
            </DialogHeader>
            {selectedDataset && (
              <div className="space-y-4 overflow-auto">
                <div>
                  <Label className="text-sm font-medium">Description</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedDataset.description || 'No description provided'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Sample Count</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedDataset.sampleCount || 0} samples
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Created</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(selectedDataset.createdAt).toLocaleString()}
                  </p>
                </div>
                {datasetSamples && datasetSamples.length > 0 ? (
                  <div>
                    <Label className="text-sm font-medium">Sample Data ({datasetSamples.length} samples)</Label>
                    <div className="mt-2 max-h-60 overflow-auto border rounded-md p-3 bg-muted">
                      <pre className="text-xs">
                        {JSON.stringify(datasetSamples, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm font-medium">Sample Data</Label>
                    <div className="mt-2 p-3 border rounded-md bg-muted/50">
                      <p className="text-sm text-muted-foreground">
                        {selectedDataset?.sampleCount || 0} samples stored
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Samples are being loaded...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}