import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Code,
  Target,
  Workflow,
  FileText,
  Settings
} from 'lucide-react';

export default function TemplateGuide() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold mb-2">Template Usage Guide</h2>
        <p className="text-muted-foreground">
          Learn how to create effective evaluation templates and integrate them with your AI evaluation workflows
        </p>
      </div>

        <div className="grid gap-6">
        {/* How Templates Work */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              How Templates Work in EvalOps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Templates are dynamic text patterns that get filled with real data during evaluation runs. 
              They're the core of how EvalOps creates consistent, repeatable evaluation prompts.
            </p>
            <div className="bg-muted p-4 rounded-md">
              <h4 className="font-medium mb-2">Template Flow:</h4>
              <ol className="list-decimal list-inside text-sm space-y-1">
                <li>Create template with variables like <code>{'{{item.question}}'}</code></li>
                <li>Save template to your template library</li>
                <li>Reference template in Evaluation Specs</li>
                <li>During runs, variables get replaced with actual dataset values</li>
                <li>Rendered prompts are sent to evaluators (LLMs, custom functions)</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Variable Syntax */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Variable Syntax
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use double curly braces to define variables. Variables support dot notation for nested object access.
            </p>
            <div className="grid gap-4">
              <div>
                <Badge variant="outline" className="mb-2">Basic Variable</Badge>
                <pre className="text-xs bg-muted p-2 rounded">{'{{item.name}}'}</pre>
                <p className="text-xs text-muted-foreground mt-1">Accesses the 'name' field from the dataset item</p>
              </div>
              <div>
                <Badge variant="outline" className="mb-2">Nested Access</Badge>
                <pre className="text-xs bg-muted p-2 rounded">{'{{sample.metadata.score}}'}</pre>
                <p className="text-xs text-muted-foreground mt-1">Accesses nested fields using dot notation</p>
              </div>
              <div>
                <Badge variant="outline" className="mb-2">Array Access</Badge>
                <pre className="text-xs bg-muted p-2 rounded">{'{{results[0].accuracy}}'}</pre>
                <p className="text-xs text-muted-foreground mt-1">Accesses array elements by index</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Common Variables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Common Variable Types
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Input Data (from datasets)</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{item.question}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{item.context}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{item.metadata}}'}</code>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Expected Output</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{expected.answer}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{expected.score}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{expected.classification}}'}</code>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Sample Output (what you're evaluating)</h4>
                <div className="space-y-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{sample.output}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{sample.reasoning}}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded block">{'{{sample.confidence}}'}</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integration Workflow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Integration with EvalOps Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="border-l-4 border-primary pl-4">
                <h4 className="font-medium text-sm">1. Create & Validate Templates</h4>
                <p className="text-xs text-muted-foreground">Use the Template Builder to create and test templates with sample data</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-medium text-sm">2. Save to Library</h4>
                <p className="text-xs text-muted-foreground">Save validated templates for reuse across multiple evaluation specs</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-medium text-sm">3. Use in Evaluation Specs</h4>
                <p className="text-xs text-muted-foreground">Reference saved templates in Eval Specs for LLM-as-judge evaluators</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-medium text-sm">4. Runtime Evaluation</h4>
                <p className="text-xs text-muted-foreground">During runs, templates are rendered with dataset values and sent to evaluators</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Best Practices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Template Structure</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Start with clear instructions for the evaluator (human or LLM)</li>
                <li>Present data in logical order: context → question → expected → actual</li>
                <li>Include specific evaluation criteria and scoring rubric</li>
                <li>Request structured output format (JSON, specific fields)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Variable Usage</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Always test templates with realistic sample data first</li>
                <li>Handle optional fields gracefully (provide fallbacks)</li>
                <li>Use descriptive variable names that match your dataset schema</li>
                <li>Validate templates before using in production eval specs</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Performance Tips</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Keep templates focused and concise to reduce LLM token usage</li>
                <li>Reuse templates across similar evaluation scenarios</li>
                <li>Version your templates when making significant changes</li>
                <li>Monitor template effectiveness through run results</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Where to Use Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Where Templates Are Used
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Primary Usage: Evaluation Specs</h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Templates are primarily used in <strong>Evaluation Specifications</strong> for LLM-as-judge evaluators. 
                When you create an eval spec with an LLM evaluator, you'll select a saved template that defines how the evaluation prompt is structured.
              </p>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Integration Points:</h4>
              <div className="grid gap-2">
                <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="font-medium text-sm">Eval Specs → LLM Evaluators</p>
                    <p className="text-xs text-muted-foreground">Templates define the prompt structure for GPT-4, Claude, etc.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
                  <div className="w-2 h-2 rounded-full bg-secondary mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="font-medium text-sm">Dataset Integration</p>
                    <p className="text-xs text-muted-foreground">Variable substitution uses your dataset fields automatically</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
                  <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="font-medium text-sm">Policy Enforcement</p>
                    <p className="text-xs text-muted-foreground">Template results feed into policy evaluation and quality gates</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}