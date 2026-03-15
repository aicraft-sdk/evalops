import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Shield, TrendingUp, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">EvalOps</h1>
              <p className="text-muted-foreground">Control Plane</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-4">
            SonarQube for AI
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Enforce measurable quality gates on LLM features using evaluators, 
            datasets, and policies. Ensure reproducible, statistically rigorous 
            evaluation of your AI systems.
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/login'}
            data-testid="button-login"
            className="px-8 py-3 text-lg"
          >
            Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <Shield className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Quality Gates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Declarative policies that automatically evaluate metrics and block 
                releases when quality thresholds aren't met.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <TrendingUp className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Statistical Rigor</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Bootstrap confidence intervals, fixed random seeds, and k≥3 
                repetitions ensure reproducible and statistically sound results.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CheckCircle className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Multiple Evaluators</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Exact match, schema validity, and LLM-as-judge evaluators with 
                operational metrics like latency and cost tracking.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Role-based access control with audit trails. Teams can safely 
                collaborate on prompts, datasets, and evaluation specifications.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="w-8 h-8 text-primary mb-2" />
              <CardTitle>CI Integration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                GitHub status checks and CI endpoints enable automated quality 
                gates in your deployment pipeline.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <TrendingUp className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Drift Detection</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Baseline management with statistical drift detection helps you 
                catch regressions in quality, cost, or performance.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Integration Partners */}
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-8">Integrations</h3>
          <div className="flex justify-center items-center gap-8 text-muted-foreground">
            <div className="text-lg font-medium">Azure OpenAI</div>
            <div className="text-lg font-medium">OpenAI</div>
            <div className="text-lg font-medium">Azure ML</div>
            <div className="text-lg font-medium">Prompt Flow</div>
            <div className="text-lg font-medium">GitHub</div>
          </div>
        </div>
      </div>
    </div>
  );
}
