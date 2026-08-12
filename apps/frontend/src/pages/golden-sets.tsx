import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GoldenSet {
  id: string;
  name: string;
  description: string | null;
}

export default function GoldenSets() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

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
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: goldenSets, isLoading: goldenSetsLoading } = useQuery<GoldenSet[]>({
    queryKey: ["/api/golden-sets"],
    enabled: isAuthenticated,
  });

  const createGoldenSetMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/golden-sets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-sets"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Golden set created",
        description: "Your golden set has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create golden set",
        variant: "destructive",
      });
    },
  });

  const handleCreateGoldenSet = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const description = (formData.get("description") as string) || undefined;
    createGoldenSetMutation.mutate({
      name: formData.get("name") as string,
      description,
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
              <h1 className="text-2xl font-semibold" data-testid="text-golden-sets-title">
                Golden Sets
              </h1>
              <p className="text-muted-foreground">
                Label examples and calibrate LLM judges against human judgment
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search golden sets..."
                  className="pl-10 w-64"
                  data-testid="input-search-golden-sets"
                />
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-golden-set">
                    <Plus className="w-4 h-4 mr-2" />
                    New
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create Golden Set</DialogTitle>
                    <DialogDescription>
                      A labeled set of examples used to calibrate an LLM judge against human
                      judgment.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateGoldenSet} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Faithfulness QA Set"
                        required
                        data-testid="input-golden-set-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="What this golden set is used to calibrate"
                        data-testid="textarea-golden-set-description"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createGoldenSetMutation.isPending}
                        data-testid="button-submit-golden-set"
                      >
                        {createGoldenSetMutation.isPending ? "Creating..." : "Create Golden Set"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <div className="p-6">
          <div className="grid gap-4">
            {goldenSetsLoading ? (
              <p className="text-muted-foreground">Loading golden sets...</p>
            ) : goldenSets && goldenSets.length > 0 ? (
              goldenSets.map((goldenSet) => (
                <Link key={goldenSet.id} href={`/golden-sets/${goldenSet.id}`}>
                  <Card
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    data-testid={`card-golden-set-${goldenSet.id}`}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg">{goldenSet.name}</CardTitle>
                      {goldenSet.description && (
                        <p className="text-sm text-muted-foreground">{goldenSet.description}</p>
                      )}
                    </CardHeader>
                  </Card>
                </Link>
              ))
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <ClipboardCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No golden sets found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a golden set to start calibrating your LLM judges
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
