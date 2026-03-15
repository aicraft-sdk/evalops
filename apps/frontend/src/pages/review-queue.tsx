import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Tag,
  Filter,
  ArrowUpRight,
  FileText,
  Bot,
} from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ReviewQueue() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promoteType, setPromoteType] = useState<"dataset" | "scenario" | null>(null);

  const filters: any = {};
  if (statusFilter) filters.status = statusFilter;
  if (priorityFilter) filters.priority = priorityFilter;
  if (sourceTypeFilter) filters.sourceType = sourceTypeFilter;

  const queryKey = ["/api/reviews/queue", filters];
  const { data: queueItems, isLoading } = useQuery<any[]>({
    queryKey,
    enabled: isAuthenticated,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/reviews/queue/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Success",
        description: "Queue item updated successfully",
      });
      setUpdateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update queue item",
        variant: "destructive",
      });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ id, type, data }: { id: string; type: "dataset" | "scenario"; data: any }) => {
      const res = await apiRequest("POST", `/api/reviews/queue/${id}/promote-to-${type}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Success",
        description: "Item promoted successfully",
      });
      setPromoteDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to promote item",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      open: "default",
      triaged: "secondary",
      fixed: "outline",
      dismissed: "outline",
      promoted: "outline",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: "bg-red-100 text-red-800",
      high: "bg-orange-100 text-orange-800",
      medium: "bg-yellow-100 text-yellow-800",
      low: "bg-gray-100 text-gray-800",
    };
    return (
      <Badge className={colors[priority] || "bg-gray-100 text-gray-800"}>
        {priority}
      </Badge>
    );
  };

  const getSourceTypeIcon = (sourceType: string) => {
    switch (sourceType) {
      case "policy_violation":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "evaluator_failure":
        return <XCircle className="h-4 w-4 text-orange-600" />;
      case "annotation":
        return <FileText className="h-4 w-4 text-blue-600" />;
      case "regression":
        return <ArrowUpRight className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in to view the review queue.</div>;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Review Queue</h1>
              <p className="text-muted-foreground mt-1">
                Triage and manage evaluation failures
              </p>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="triaged">Triaged</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                      <SelectItem value="promoted">Promoted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source Type</Label>
                  <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="policy_violation">Policy Violation</SelectItem>
                      <SelectItem value="evaluator_failure">Evaluator Failure</SelectItem>
                      <SelectItem value="annotation">Annotation</SelectItem>
                      <SelectItem value="regression">Regression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue Items */}
          <Card>
            <CardHeader>
              <CardTitle>
                Queue Items ({queueItems?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div>Loading...</div>
              ) : !queueItems || queueItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items in the review queue
                </div>
              ) : (
                <div className="space-y-4">
                  {queueItems.map((item) => (
                    <Card key={item.id} className="hover:bg-muted/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {getSourceTypeIcon(item.sourceType)}
                              <span className="font-medium">{item.sourceType}</span>
                              {getStatusBadge(item.status)}
                              {getPriorityBadge(item.priority)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Run: <Link href={`/runs/${item.runId}`} className="text-primary hover:underline">{item.runId}</Link>
                            </div>
                            {item.notes && (
                              <div className="text-sm">{item.notes}</div>
                            )}
                            {item.tags && Array.isArray(item.tags) && item.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {item.tags.map((tag: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedItem(item);
                                setUpdateDialogOpen(true);
                              }}
                            >
                              Update
                            </Button>
                            {item.status === "open" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setPromoteType("dataset");
                                    setPromoteDialogOpen(true);
                                  }}
                                >
                                  Promote to Dataset
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setPromoteType("scenario");
                                    setPromoteDialogOpen(true);
                                  }}
                                >
                                  Promote to Scenario
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Update Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Queue Item</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select
                  defaultValue={selectedItem.status}
                  onValueChange={(value) => {
                    updateMutation.mutate({
                      id: selectedItem.id,
                      data: { status: value },
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="triaged">Triaged</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                    <SelectItem value="promoted">Promoted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  defaultValue={selectedItem.priority}
                  onValueChange={(value) => {
                    updateMutation.mutate({
                      id: selectedItem.id,
                      data: { priority: value },
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Promote Dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Promote to {promoteType === "dataset" ? "Dataset" : "Scenario"}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && promoteType && (
            <div className="space-y-4">
              {promoteType === "dataset" ? (
                <>
                  <div>
                    <Label>Dataset ID</Label>
                    <Input
                      id="dataset-id"
                      placeholder="Enter dataset ID"
                      onChange={(e) => {
                        // Store in state for mutation
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      const datasetId = (document.getElementById("dataset-id") as HTMLInputElement)?.value;
                      if (datasetId) {
                        promoteMutation.mutate({
                          id: selectedItem.id,
                          type: "dataset",
                          data: { datasetId },
                        });
                      }
                    }}
                  >
                    Promote
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <Label>Suite ID</Label>
                    <Input
                      id="suite-id"
                      placeholder="Enter suite ID"
                    />
                  </div>
                  <div>
                    <Label>Scenario ID (optional)</Label>
                    <Input
                      id="scenario-id"
                      placeholder="Enter scenario ID or leave blank to create new"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      const suiteId = (document.getElementById("suite-id") as HTMLInputElement)?.value;
                      const scenarioId = (document.getElementById("scenario-id") as HTMLInputElement)?.value;
                      if (suiteId) {
                        promoteMutation.mutate({
                          id: selectedItem.id,
                          type: "scenario",
                          data: { suiteId, scenarioId: scenarioId || undefined },
                        });
                      }
                    }}
                  >
                    Promote
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
