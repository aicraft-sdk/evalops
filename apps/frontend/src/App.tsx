import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Datasets from "@/pages/datasets";
import Prompts from "@/pages/prompts";
import EvalSpecs from "@/pages/eval-specs";
import Runs from "@/pages/runs";
import RunDetails from "@/pages/run-details";
import Policies from "@/pages/policies";
import AuditTrail from "@/pages/audit-trail";
import Templates from "@/pages/templates";
import Settings from "@/pages/settings";
import { Providers } from "@/pages/providers";
import { CostAnalytics } from "@/pages/cost-analytics";
import { ModelRegistry } from "@/pages/model-registry";
import AdvancedEvals from "@/pages/advanced-evals";
import CustomEvaluators from "@/pages/custom-evaluators";
import CustomEvaluatorUsage from "@/pages/custom-evaluator-usage";
import Agents from "@/pages/agents";
import AgentDetail from "@/pages/agent-detail";
import Simulations from "@/pages/simulations";
import ReviewQueue from "@/pages/review-queue";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/datasets" component={Datasets} />
          <Route path="/prompts" component={Prompts} />
          <Route path="/eval-specs" component={EvalSpecs} />
          <Route path="/runs" component={Runs} />
          <Route path="/runs/:runId" component={RunDetails} />
          <Route path="/policies" component={Policies} />
          <Route path="/audit-trail" component={AuditTrail} />
          <Route path="/templates" component={Templates} />
          <Route path="/templates/builder" component={Templates} />
          <Route path="/templates/patterns" component={Templates} />
          <Route path="/templates/guide" component={Templates} />
          <Route path="/providers" component={Providers} />
          <Route path="/cost-analytics" component={CostAnalytics} />
          <Route path="/model-registry" component={ModelRegistry} />
          <Route path="/settings" component={Settings} />
          <Route path="/advanced-evals" component={AdvancedEvals} />
          <Route path="/custom-evaluators" component={CustomEvaluators} />
          <Route path="/custom-evaluators/:id/usage" component={CustomEvaluatorUsage} />
          <Route path="/agents" component={Agents} />
          <Route path="/agents/:id" component={AgentDetail} />
          <Route path="/simulations" component={Simulations} />
          <Route path="/review-queue" component={ReviewQueue} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;