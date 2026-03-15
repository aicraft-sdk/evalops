import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bell, X, CheckCircle } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";

interface AlertEvent {
  id: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  metadata?: any;
}

export function AlertNotifications() {
  const { lastMessage } = useWebSocket();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  useEffect(() => {
    if (lastMessage?.type === 'alert') {
      const alertData = lastMessage.data as AlertEvent;
      
      // Add to alerts list
      setAlerts(prev => [alertData, ...prev.slice(0, 4)]); // Keep max 5 alerts
      
      // Show toast notification
      toast({
        title: `${alertData.severity.toUpperCase()} Alert`,
        description: alertData.title,
        variant: alertData.severity === 'critical' || alertData.severity === 'high' ? 'destructive' : 'default',
      });
    }
  }, [lastMessage, toast]);

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <Bell className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 border-red-200 dark:bg-red-900/20';
      case 'high': return 'bg-red-50 border-red-100 dark:bg-red-900/10';
      case 'medium': return 'bg-yellow-50 border-yellow-100 dark:bg-yellow-900/10';
      default: return 'bg-blue-50 border-blue-100 dark:bg-blue-900/10';
    }
  };

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm" data-testid="alert-notifications">
      {alerts.map((alert) => (
        <Alert 
          key={alert.id} 
          className={`${getSeverityColor(alert.severity)} relative`}
          data-testid={`alert-${alert.id}`}
        >
          <div className="flex items-start gap-2">
            {getSeverityIcon(alert.severity)}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <AlertTitle className="text-sm font-medium">
                  {alert.title}
                  <Badge 
                    variant="outline" 
                    className="ml-2 text-xs"
                    data-testid={`badge-${alert.severity}`}
                  >
                    {alert.severity}
                  </Badge>
                </AlertTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-transparent"
                  onClick={() => dismissAlert(alert.id)}
                  data-testid={`dismiss-${alert.id}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <AlertDescription className="text-sm text-muted-foreground">
                {alert.message}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      ))}
    </div>
  );
}