import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Filter, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { EnhancedAuditEntry } from "@evalops/shared";

// API responses are JSON-serialized, so Date columns (e.g. createdAt) arrive
// as ISO strings, not Date instances. EnhancedAuditEntry is inferred from the
// Drizzle schema (createdAt: Date | null) which reflects the DB row shape,
// not the wire shape — override it to match what actually reaches the client.
type AuditTrailEntry = Omit<EnhancedAuditEntry, "createdAt"> & {
  createdAt: string;
};

export default function AuditTrail() {
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
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: auditEntries } = useQuery<AuditTrailEntry[]>({
    queryKey: ["/api/audit-trail"],
    enabled: isAuthenticated,
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-success/10 text-success border-success/20';
      case 'update':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'delete':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return 'bg-muted/10 text-muted-foreground border-muted/20';
    }
  };

  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case 'prompt':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'flow':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'dataset':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'evalSpec':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'policy':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'baseline':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
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
              <h1 className="text-2xl font-semibold" data-testid="text-audit-trail-title">Audit Trail</h1>
              <p className="text-muted-foreground">Track all changes and actions across the platform</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search audit logs..." 
                  className="pl-10 w-64"
                  data-testid="input-search-audit"
                />
              </div>
              <Button variant="outline" data-testid="button-filter-audit">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" data-testid="button-export-audit">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </header>
        
        <div className="p-6">
          <Card>
            <CardHeader className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Activity Log</h2>
                  <p className="text-sm text-muted-foreground">Complete record of all system changes</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Timestamp</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">User</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Action</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Entity Type</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Entity</th>
                      <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditEntries?.length ? (
                      auditEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/25">
                          <td className="py-4 px-6">
                            <span className="text-sm">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium">
                                  {((entry as any).userName || entry.userId)?.charAt(0)?.toUpperCase() || 'U'}
                                </span>
                              </div>
                              <span className="text-sm">
                                {(entry as any).userName || 'Unknown User'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge 
                              className={`${getActionColor(entry.action)} border`}
                              data-testid={`badge-action-${entry.id}`}
                            >
                              {entry.action.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            <Badge 
                              className={`${getEntityTypeColor(entry.entityType)} border-0`}
                              data-testid={`badge-entity-type-${entry.id}`}
                            >
                              {entry.entityType.replace('evalSpec', 'Eval Spec').toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            <div>
                              <p className="text-sm font-medium" data-testid={`entity-name-${entry.id}`}>
                                {(entry as any).entityName || 'Unknown'}
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">
                                ID: {entry.entityId.slice(0, 8)}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="max-w-md">
                              <p className="text-sm font-medium mb-1" data-testid={`description-${entry.id}`}>
                                {(entry as any).description || `${entry.action} ${entry.entityType}`}
                              </p>
                              {entry.changes ? (
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-primary">
                                    View technical details
                                  </summary>
                                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                                    {JSON.stringify(entry.changes, null, 2)}
                                  </pre>
                                </details>
                              ) : (
                                <span className="text-xs text-muted-foreground">No technical details</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center">
                          <div className="text-center">
                            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No audit entries found</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Activity will appear here as users make changes
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {auditEntries?.length ? (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing <span className="font-medium">1-{Math.min(50, auditEntries.length)}</span> of{' '}
                    <span className="font-medium">{auditEntries.length}</span> entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled data-testid="button-previous-audit">
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-next-audit">
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
