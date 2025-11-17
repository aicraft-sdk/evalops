import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PolicyViolation {
  id: string;
  message: string;
  severity: string;
  evidence?: any;
  createdAt: string;
}

interface PolicyViolationsProps {
  violations?: PolicyViolation[];
  isLoading?: boolean;
}

export function PolicyViolations({ violations, isLoading }: PolicyViolationsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-6 py-4 border-b border-border">
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4 border border-border rounded-lg">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-6 py-4 border-b border-border">
        <CardTitle className="text-lg font-semibold">Policy Violations</CardTitle>
        <p className="text-sm text-muted-foreground">Recent failures requiring attention</p>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {violations?.length ? (
          violations.slice(0, 5).map((violation) => (
            <div 
              key={violation.id} 
              className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-lg"
            >
              <div className="w-8 h-8 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="font-medium" data-testid={`violation-message-${violation.id}`}>
                  {violation.message}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Severity: {violation.severity.toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(violation.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-success" />
            </div>
            <p className="text-muted-foreground">No policy violations</p>
            <p className="text-sm text-muted-foreground mt-1">
              All recent runs have passed policy checks
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
