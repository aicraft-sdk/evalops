import { Circle } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

export function LiveStatusIndicator() {
  const { isConnected } = useWebSocket();

  return (
    <div className="flex items-center gap-2 text-sm">
      <Circle 
        className={`w-3 h-3 ${isConnected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`}
        data-testid="status-indicator"
      />
      <span className="text-muted-foreground" data-testid="status-text">
        {isConnected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}