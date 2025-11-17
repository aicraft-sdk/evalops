import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Sidebar } from '@/components/layout/sidebar';
import { Switch, Route, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Lightbulb,
  BookOpen
} from 'lucide-react';

// Import subpage components
import TemplateBuilder from './templates/builder';
import TemplatePatterns from './templates/patterns';
import TemplateGuide from './templates/guide';

export default function Templates() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  // Redirect to login if not authenticated
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

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    );
  }

  const getActiveTab = () => {
    if (location.includes('/templates/patterns')) return 'patterns';
    if (location.includes('/templates/guide')) return 'guide';
    return 'builder';
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b">
          <h1 className="text-3xl font-bold mb-2" data-testid="title-templates">Templates</h1>
          <p className="text-muted-foreground">
            Create, test, and manage dynamic evaluation templates
          </p>
          
          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-4">
            <Link href="/templates">
              <Button 
                variant={getActiveTab() === 'builder' ? 'default' : 'outline'} 
                size="sm"
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Builder
              </Button>
            </Link>
            <Link href="/templates/patterns">
              <Button 
                variant={getActiveTab() === 'patterns' ? 'default' : 'outline'} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Lightbulb className="h-4 w-4" />
                Patterns
              </Button>
            </Link>
            <Link href="/templates/guide">
              <Button 
                variant={getActiveTab() === 'guide' ? 'default' : 'outline'} 
                size="sm"
                className="flex items-center gap-2"
              >
                <BookOpen className="h-4 w-4" />
                Usage Guide
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <Switch>
            <Route path="/templates" component={TemplateBuilder} />
            <Route path="/templates/patterns" component={TemplatePatterns} />
            <Route path="/templates/guide" component={TemplateGuide} />
            <Route>
              <TemplateBuilder />
            </Route>
          </Switch>
        </div>
      </div>
    </div>
  );
}