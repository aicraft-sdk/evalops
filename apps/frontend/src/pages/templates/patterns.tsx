import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Copy,
  ExternalLink,
  Lightbulb
} from 'lucide-react';

export default function TemplatePatterns() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Fetch template patterns
  const { data: patterns, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ['/api/templates/patterns'],
    enabled: isAuthenticated,
  });

  const loadPattern = (patternData: any) => {
    // This would integrate with the builder - for now just copy to clipboard
    let templateContent = '';
    if (typeof patternData === 'string') {
      templateContent = patternData;
    } else if (patternData && patternData.systemPrompt) {
      templateContent = patternData.systemPrompt;
    } else if (patternData && patternData.template) {
      templateContent = patternData.template;
    } else {
      templateContent = JSON.stringify(patternData, null, 2);
    }

    navigator.clipboard.writeText(templateContent);
    toast({
      title: "Pattern Copied",
      description: "Template pattern copied to clipboard. Navigate to Builder to paste it.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
          Loading patterns...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold mb-2">Template Patterns</h2>
        <p className="text-muted-foreground">
          Pre-built templates for common evaluation scenarios. Copy these as starting points for your custom evaluators.
        </p>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {patterns && Object.entries(patterns as Record<string, any>).map(([key, patternTemplate]) => (
          <Card key={key} className="h-fit">
            <CardHeader>
              <CardTitle className="capitalize flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </CardTitle>
              <CardDescription>
                Ready-to-use template for {key.toLowerCase()} evaluation scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <pre className="text-xs overflow-x-auto max-h-48 overflow-y-auto">
                  {JSON.stringify(patternTemplate, null, 2)}
                </pre>
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => loadPattern(patternTemplate)}
                  data-testid={`load-pattern-${key}`}
                  className="flex-1"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy to Clipboard
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(patternTemplate, null, 2));
                    toast({
                      title: "JSON Copied",
                      description: "Full pattern JSON copied to clipboard",
                    });
                  }}
                  data-testid={`copy-pattern-${key}`}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Copy JSON
                </Button>
              </div>

              <div className="text-xs text-muted-foreground pt-2 border-t">
                <strong>Use Case:</strong> This template is designed for {key.toLowerCase()} evaluation tasks. 
                Copy it to the Builder to customize for your specific needs.
              </div>
            </CardContent>
          </Card>
          ))}
        </div>

        {(!patterns || Object.keys(patterns).length === 0) && (
        <Card>
          <CardContent className="py-8 text-center">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Patterns Available</h3>
            <p className="text-muted-foreground">
              Template patterns are currently being loaded or unavailable.
            </p>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}