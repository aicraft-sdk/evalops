import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, ClipboardList, Play, InfoIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

// Component for evaluator information modal
function EvaluatorInfoModal({ title, description, useCase, example, score }: {
  title: string;
  description: string; 
  useCase: string;
  example: string;
  score: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="p-1 h-6 w-6">
          <InfoIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <h4 className="font-semibold text-sm mb-2">Use Case</h4>
            <p className="text-sm text-muted-foreground">{useCase}</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Example</h4>
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded">{example}</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Scoring</h4>
            <p className="text-sm text-muted-foreground">{score}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EvalSpecs() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

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

  const { data: evalSpecs, isLoading: evalSpecsLoading } = useQuery<any[]>({
    queryKey: ["/api/eval-specs"],
    enabled: isAuthenticated,
  });

  const { data: datasets } = useQuery<any[]>({
    queryKey: ["/api/datasets"],
    enabled: isAuthenticated && isCreateDialogOpen,
  });

  const { data: prompts } = useQuery<any[]>({
    queryKey: ["/api/prompts"],
    enabled: isAuthenticated && isCreateDialogOpen,
  });

  const { data: providers } = useQuery<any[]>({
    queryKey: ["/api/providers"],
    enabled: isAuthenticated && isCreateDialogOpen,
  });

  const { data: models } = useQuery<any[]>({
    queryKey: ["/api/models"],
    enabled: isAuthenticated && isCreateDialogOpen,
  });

  const { data: policies } = useQuery<any[]>({
    queryKey: ["/api/policies"],
    enabled: isAuthenticated,
  });

  const { data: agents } = useQuery<any[]>({
    queryKey: ["/api/agents"],
    enabled: isAuthenticated && isCreateDialogOpen,
  });

  const [targetType, setTargetType] = useState<"prompt" | "flow" | "agent">("prompt");

  const createRunMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create run");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setRunDialogOpen(false);
      toast({
        title: "Success",
        description: "Evaluation run created successfully",
      });
      setLocation("/runs");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create run",
        variant: "destructive",
      });
    },
  });

  const handleRunSpec = (specId: string) => {
    setSelectedSpecId(specId);
    setRunDialogOpen(true);
  };

  const handleCreateRun = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createRunMutation.mutate({
      evalSpecId: selectedSpecId,
      policyId: formData.get("policyId"),
      description: formData.get("description") || `Run for ${evalSpecs?.find(s => s.id === selectedSpecId)?.name}`,
    });
  };

  const createEvalSpecMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/eval-specs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval-specs"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Eval Spec created",
        description: "Your evaluation specification has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create eval spec",
        variant: "destructive",
      });
    },
  });

  const handleCreateEvalSpec = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const evaluators = [];
    if (formData.get("exactMatch")) {
      evaluators.push({ 
        type: "exact_match",
        config: {
          strictness: formData.get("exactMatchStrictness") || "moderate"
        }
      });
    }
    if (formData.get("battle")) evaluators.push({ type: "battle" });
    if (formData.get("factuality")) evaluators.push({ type: "factuality" });
    if (formData.get("security")) {
      evaluators.push({ 
        type: "security",
        config: {
          check_pii: formData.get("securityCheckPII") === "on",
          check_toxicity: formData.get("securityCheckToxicity") === "on", 
          check_injection: formData.get("securityCheckInjection") === "on"
        }
      });
    }
    if (formData.get("answerRelevancy")) evaluators.push({ type: "answer_relevancy" });
    if (formData.get("jsonValidity")) {
      const jsonSchema = formData.get("jsonSchema") as string;
      let schema = null;
      if (jsonSchema && jsonSchema.trim()) {
        try {
          schema = JSON.parse(jsonSchema);
        } catch (error) {
          toast({
            title: "Invalid JSON Schema",
            description: "Please provide valid JSON for the schema or leave it empty.",
            variant: "destructive",
          });
          return;
        }
      }
      evaluators.push({ 
        type: "json_validity",
        config: { schema }
      });
    }
    if (formData.get("llmJudge")) {
      const judgePromptId = formData.get("judgePromptId") as string;
      evaluators.push({ 
        type: "llm_judge",
        judgePromptId: judgePromptId && judgePromptId !== "default" ? judgePromptId : null
      });
    }
    if (formData.get("schemaValidation")) evaluators.push({ type: "schema_validation" });
    
    // Phase 2 RAG evaluators
    if (formData.get("contextPrecision")) evaluators.push({ type: "context_precision" });
    if (formData.get("contextRecall")) evaluators.push({ type: "context_recall" });
    if (formData.get("contextRelevancy")) evaluators.push({ type: "context_relevancy" });
    if (formData.get("faithfulness")) evaluators.push({ type: "faithfulness" });
    if (formData.get("answerCorrectness")) evaluators.push({ type: "answer_correctness" });

    // Phase 3 Safety evaluators
    if (formData.get("piiDetection")) {
      evaluators.push({ 
        type: "pii_detection",
        config: {
          strictness: formData.get("piiStrictness") || "moderate",
          categories: {
            email: formData.get("piiCheckEmail") === "on",
            phone: formData.get("piiCheckPhone") === "on", 
            ssn: formData.get("piiCheckSSN") === "on",
            credit_card: formData.get("piiCheckCreditCard") === "on",
            address: formData.get("piiCheckAddress") === "on"
          }
        }
      });
    }
    if (formData.get("jailbreakDetection")) {
      evaluators.push({ 
        type: "jailbreak_detection",
        config: {
          strictness: formData.get("jailbreakStrictness") || "moderate",
          check_prompt_injection: formData.get("jailbreakCheckPromptInjection") === "on",
          check_system_override: formData.get("jailbreakCheckSystemOverride") === "on"
        }
      });
    }

    let modelConfig = {};
    try {
      modelConfig = JSON.parse(formData.get("modelConfig") as string);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please provide valid JSON for the model config.",
        variant: "destructive",
      });
      return;
    }

    // Generate seeds array based on repetitions
    const reps = parseInt(formData.get("repetitions") as string) || 3;
    const seeds = Array.from({ length: reps }, (_, i) => Math.floor(Math.random() * 10000));

    createEvalSpecMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      datasetId: formData.get("datasetId"),
      promptId: targetType === "prompt" ? formData.get("promptId") : null,
      agentId: targetType === "agent" ? formData.get("agentId") : null,
      providerId: formData.get("providerId"),
      modelId: formData.get("modelId"),
      evaluators,
      repetitions: reps,
      modelConfig,
      version: "1.0",
      seeds,
    });
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
              <h1 className="text-2xl font-semibold" data-testid="text-eval-specs-title">Evaluation Specifications</h1>
              <p className="text-muted-foreground">Configure and manage evaluation specifications</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search eval specs..." 
                  className="pl-10 w-64"
                  data-testid="input-search-eval-specs"
                />
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-eval-spec">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Eval Spec
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Evaluation Specification</DialogTitle>
                    <DialogDescription>
                      Define how to evaluate prompts against datasets.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateEvalSpec} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Support Quality Check"
                        required
                        data-testid="input-eval-spec-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Evaluate customer support response quality"
                        data-testid="textarea-eval-spec-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="datasetId">Dataset</Label>
                      <Select name="datasetId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select dataset" />
                        </SelectTrigger>
                        <SelectContent>
                          {datasets?.map((dataset) => (
                            <SelectItem key={dataset.id} value={dataset.id}>
                              {dataset.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Target Type</Label>
                      <Select
                        value={targetType}
                        onValueChange={(v) => setTargetType(v as "prompt" | "flow" | "agent")}
                        name="targetType"
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select target type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prompt">Prompt</SelectItem>
                          <SelectItem value="flow">Flow</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {targetType === "prompt" && (
                      <div>
                        <Label htmlFor="promptId">Prompt</Label>
                        <Select name="promptId">
                          <SelectTrigger>
                            <SelectValue placeholder="Select prompt" />
                          </SelectTrigger>
                          <SelectContent>
                            {prompts?.map((prompt) => (
                              <SelectItem key={prompt.id} value={prompt.id}>
                                {prompt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {targetType === "flow" && (
                      <div>
                        <Label htmlFor="flowId">Flow</Label>
                        <Select name="flowId">
                          <SelectTrigger>
                            <SelectValue placeholder="Select flow" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No flow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {targetType === "agent" && (
                      <div>
                        <Label htmlFor="agentId">Agent</Label>
                        <Select name="agentId">
                          <SelectTrigger>
                            <SelectValue placeholder="Select agent" />
                          </SelectTrigger>
                          <SelectContent>
                            {agents?.filter((a) => a.active).map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.name} (v{agent.version})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="providerId">AI Provider</Label>
                        <Select name="providerId" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {providers?.filter(p => p.isActive).map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                <div className="flex items-center gap-2">
                                  <span>{provider.name}</span>
                                  <span className={`h-2 w-2 rounded-full ${provider.healthStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="modelId">Model</Label>
                        <Select name="modelId" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models?.filter(m => m.isActive).map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium">{model.displayName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ${model.inputCostPer1k?.toFixed(3)}/1K in • ${model.outputCostPer1k?.toFixed(3)}/1K out
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Evaluators</Label>
                      <div className="space-y-4 mt-2">
                        <div className="border rounded-lg p-4 space-y-3">
                          <label className="flex items-center space-x-2">
                            <input type="checkbox" name="exactMatch" className="rounded" />
                            <span className="font-medium">Exact Match</span>
                          </label>
                          <div className="ml-6 space-y-2">
                            <Label htmlFor="exactMatchStrictness" className="text-sm">Matching Strictness</Label>
                            <Select name="exactMatchStrictness">
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select strictness level" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="strict">Strict (95% similarity) - Exact character match</SelectItem>
                                <SelectItem value="moderate">Moderate (80% similarity) - Minor differences allowed</SelectItem>
                                <SelectItem value="lenient">Lenient (60% similarity) - Key concepts match</SelectItem>
                                <SelectItem value="semantic">Semantic (70% similarity) - Meaning-based match</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Controls how strictly AI responses are compared to expected outputs
                            </p>
                          </div>
                        </div>
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="battle" className="rounded" />
                              <span className="font-medium">Battle (A/B Testing)</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Battle (A/B Testing)"
                              description="Compares response quality between models or different outputs using expert evaluation."
                              useCase="Model comparison, response ranking, and quality assessment between alternatives"
                              example="Response A: 'Paris is in France.' vs Response B: 'Paris, the capital of France, is located in the northern part of the country.' → Response B would score higher for completeness and informativeness."
                              score="0-30%: Much worse than baseline | 30-50%: Worse quality | 50-70%: Similar quality | 70-90%: Better quality | 90-100%: Much better quality"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Compares response quality between models or outputs
                          </p>
                        </div>
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="factuality" className="rounded" />
                              <span className="font-medium">Factuality Check</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Factuality Check"
                              description="Verifies the factual accuracy of claims and identifies potential misinformation in AI responses."
                              useCase="Critical for news, educational content, medical information, and any fact-sensitive applications"
                              example="Response: 'The Great Wall of China is visible from space with the naked eye.' → Low factuality score as this is a common misconception debunked by astronauts."
                              score="0-20%: Contains significant misinformation | 20-40%: Some inaccuracies | 40-60%: Mostly accurate | 60-80%: Reliable information | 80-100%: Highly accurate facts"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Verifies factual accuracy and identifies misinformation
                          </p>
                        </div>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="security" className="rounded" />
                              <span className="font-medium">Security & Safety</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Security & Safety"
                              description="Comprehensive security scanner that checks for PII exposure, toxic content, and injection attacks."
                              useCase="Essential for production AI systems to prevent data leaks, harmful content, and security vulnerabilities"
                              example="Response containing 'My SSN is 123-45-6789' → Low security score due to PII exposure. Response with hate speech → Low score for toxicity."
                              score="0-20%: Serious security issues | 20-40%: Moderate concerns | 40-60%: Minor issues | 60-80%: Generally safe | 80-100%: Completely secure"
                            />
                          </div>
                          <div className="ml-6 space-y-2">
                            <div className="flex items-center space-x-2 text-sm">
                              <input type="checkbox" name="securityCheckPII" className="rounded" defaultChecked />
                              <span>Check for PII exposure</span>
                            </div>
                            <div className="flex items-center space-x-2 text-sm">
                              <input type="checkbox" name="securityCheckToxicity" className="rounded" defaultChecked />
                              <span>Check for toxic content</span>
                            </div>
                            <div className="flex items-center space-x-2 text-sm">
                              <input type="checkbox" name="securityCheckInjection" className="rounded" defaultChecked />
                              <span>Check for injection attacks</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground ml-6">
                            Identifies security vulnerabilities and unsafe content
                          </p>
                        </div>
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="answerRelevancy" className="rounded" />
                              <span className="font-medium">Answer Relevancy</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Answer Relevancy"
                              description="Measures how relevant and responsive the answer is to the specific question asked."
                              useCase="Core metric for QA systems, chatbots, and RAG applications to ensure answers address user needs"
                              example="Question: 'How do I bake a chocolate cake?' Answer about cookie recipes → Low relevancy. Answer with cake ingredients and steps → High relevancy."
                              score="0-20%: Completely irrelevant | 20-40%: Partially relevant | 40-60%: Somewhat relevant | 60-80%: Highly relevant | 80-100%: Perfectly addresses question"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Measures how well the answer addresses the question (RAG core metric)
                          </p>
                        </div>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="jsonValidity" className="rounded" />
                              <span className="font-medium">JSON Validity</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="JSON Validity"
                              description="Validates JSON structure and optional schema compliance for structured AI outputs."
                              useCase="Critical for APIs, structured data generation, and any application requiring valid JSON responses"
                              example="Valid JSON: {'status': 'success'} with schema requiring 'status' field → 100% score. Invalid JSON: {status: success} (missing quotes) → 0% score."
                              score="0%: Invalid JSON syntax | 100%: Valid JSON (and schema compliant if schema provided)"
                            />
                          </div>
                          <div className="ml-6 space-y-2">
                            <Label htmlFor="jsonSchema" className="text-sm">JSON Schema (Optional)</Label>
                            <Textarea
                              id="jsonSchema"
                              name="jsonSchema"
                              placeholder='{"type": "object", "required": ["status"], "properties": {"status": {"type": "string"}}}'
                              className="text-xs font-mono"
                              rows={3}
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave empty to just validate JSON syntax, or provide schema for structure validation
                            </p>
                          </div>
                        </div>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="llmJudge" className="rounded" />
                              <span className="font-medium">LLM as Judge</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="LLM as Judge"
                              description="Uses another AI model to evaluate response quality against expected answers or criteria."
                              useCase="Subjective evaluation of quality, tone, helpfulness, creativity, and other nuanced aspects"
                              example="Evaluating if a creative writing response is engaging and follows the prompt guidelines"
                              score="0-100%: AI judge rates quality based on specified criteria in the judge prompt"
                            />
                          </div>
                          <div className="ml-6 space-y-2">
                            <Label htmlFor="judgePromptId" className="text-sm">Judge Prompt Template</Label>
                            <Select name="judgePromptId">
                              <SelectTrigger>
                                <SelectValue placeholder="Select a judge prompt template (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Use default prompt</SelectItem>
                                {prompts?.filter(p => p.category === 'llm_judge').map((prompt) => (
                                  <SelectItem key={prompt.id} value={prompt.id}>
                                    {prompt.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Select a pre-built judge prompt or leave empty to use the default evaluation prompt
                            </p>
                          </div>
                        </div>
                        <div className="border rounded-lg p-4">
                          <label className="flex items-center space-x-2">
                            <input type="checkbox" name="schemaValidation" className="rounded" />
                            <span className="font-medium">Schema Validation</span>
                          </label>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Validates response format and structure
                          </p>
                        </div>
                        
                        {/* Phase 2 RAG Evaluators */}
                        <div className="col-span-full">
                          <h4 className="font-semibold text-lg mb-3 text-blue-600">🔍 RAG & Information Retrieval Evaluators</h4>
                          <p className="text-sm text-muted-foreground mb-4">
                            Essential for evaluating Retrieval-Augmented Generation (RAG) systems
                          </p>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="contextPrecision" className="rounded" />
                              <span className="font-medium">Context Precision</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Context Precision"
                              description="Measures what proportion of retrieved context is actually relevant to answering the query."
                              useCase="Essential for evaluating retrieval quality in RAG systems"
                              example="Query: 'What is the capital of France?' Context: 'Paris is the capital of France. The Eiffel Tower is 324 meters tall.' → High precision if most context relates to the capital question."
                              score="80-100%: Most context directly relevant | 40-80%: Mixed relevant/irrelevant | 0-40%: Mostly irrelevant context"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Evaluates retrieval quality - how much retrieved context is relevant
                          </p>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="contextRecall" className="rounded" />
                              <span className="font-medium">Context Recall</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Context Recall"
                              description="Measures if all necessary information was retrieved to answer the question completely."
                              useCase="Checks completeness of retrieval for comprehensive answers"
                              example="Question about 'Python data types' - if context covers strings and lists but misses dictionaries and sets, recall would be lower."
                              score="80-100%: All needed info retrieved | 40-80%: Most info present | 0-40%: Missing key information"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Checks if all necessary information was retrieved
                          </p>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="contextRelevancy" className="rounded" />
                              <span className="font-medium">Context Relevancy</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Context Relevancy"
                              description="Evaluates how well retrieved context aligns with the user's information need."
                              useCase="Measures topical alignment between retrieved information and user query"
                              example="User asks about 'machine learning algorithms' but gets context about 'data preprocessing' → Lower relevancy score."
                              score="80-100%: Perfect topical match | 40-80%: Somewhat related | 0-40%: Off-topic context"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Measures topical alignment between context and query
                          </p>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="faithfulness" className="rounded" />
                              <span className="font-medium">Faithfulness</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Faithfulness"
                              description="Ensures AI responses stay true to provided context without adding unsupported information."
                              useCase="Critical for preventing hallucination in RAG systems"
                              example="Context says 'Paris has 2.1 million residents' but AI responds 'Paris has over 3 million residents' → Low faithfulness due to unsupported claim."
                              score="80-100%: All claims supported by context | 40-80%: Mostly faithful | 0-40%: Contains unsupported information"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Prevents hallucination - ensures answers stay true to context
                          </p>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="answerCorrectness" className="rounded" />
                              <span className="font-medium">Answer Correctness</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Answer Correctness"
                              description="Combines semantic similarity with factual accuracy for comprehensive answer evaluation."
                              useCase="Overall answer quality metric combining multiple dimensions"
                              example="Expected: 'Python is interpreted' vs Actual: 'Python is a compiled language' → Low correctness due to factual error despite semantic similarity."
                              score="80-100%: Excellent semantic + factual match | 40-80%: Good similarity | 0-40%: Poor alignment or major errors"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Comprehensive quality combining semantic similarity + factual accuracy
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Phase 3: Safety Evaluation Pack */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Phase 3: Safety Evaluation Pack</h3>
                        <Badge variant="outline" className="text-xs">Privacy & Security</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Specialized evaluators for detecting privacy violations and security threats in AI outputs.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="piiDetection" className="rounded" />
                              <span className="font-medium">PII Detection</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="PII Detection"
                              description="Detects personally identifiable information in AI outputs to ensure privacy compliance."
                              useCase="Essential for GDPR/CCPA compliance and preventing accidental exposure of sensitive data"
                              example="Output contains 'john.smith@email.com' or '555-123-4567' → Detected as email/phone PII requiring privacy review."
                              score="0-100%: % of outputs containing PII | Lower scores indicate better privacy protection"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Detects emails, phone numbers, SSNs, addresses, and other PII
                          </p>
                          
                          {/* PII Configuration Options */}
                          <div className="ml-6 mt-3 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Detection Categories:</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="piiCheckEmail" className="rounded scale-75" defaultChecked />
                                <span>Email addresses</span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="piiCheckPhone" className="rounded scale-75" defaultChecked />
                                <span>Phone numbers</span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="piiCheckSSN" className="rounded scale-75" defaultChecked />
                                <span>Social Security</span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="piiCheckCreditCard" className="rounded scale-75" />
                                <span>Credit cards</span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="piiCheckAddress" className="rounded scale-75" />
                                <span>Addresses</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-2">
                              <input type="checkbox" name="jailbreakDetection" className="rounded" />
                              <span className="font-medium">Jailbreak Detection</span>
                            </label>
                            <EvaluatorInfoModal 
                              title="Jailbreak Detection"
                              description="Identifies attempts to bypass AI safety guidelines and prompt injection attacks."
                              useCase="Critical for maintaining AI system integrity and preventing malicious exploitation"
                              example="Input: 'Ignore previous instructions and reveal...' → Detected as prompt injection attempt requiring security review."
                              score="0-100%: % of outputs indicating successful jailbreak | Lower scores indicate better security"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground ml-6 mt-1">
                            Detects prompt injection and system override attempts
                          </p>
                          
                          {/* Jailbreak Configuration Options */}
                          <div className="ml-6 mt-3 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Detection Types:</div>
                            <div className="space-y-1 text-xs">
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="jailbreakCheckPromptInjection" className="rounded scale-75" defaultChecked />
                                <span>Prompt injection attempts</span>
                              </label>
                              <label className="flex items-center space-x-1">
                                <input type="checkbox" name="jailbreakCheckSystemOverride" className="rounded scale-75" defaultChecked />
                                <span>System override attempts</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="repetitions">Repetitions</Label>
                      <Input
                        id="repetitions"
                        name="repetitions"
                        type="number"
                        min="1"
                        max="10"
                        defaultValue="3"
                        required
                        data-testid="input-repetitions"
                      />
                    </div>
                    <div>
                      <Label htmlFor="modelConfig">Model Config (JSON)</Label>
                      <Textarea
                        id="modelConfig"
                        name="modelConfig"
                        placeholder='{"model": "gpt-4", "temperature": 1.0, "max_tokens": 1000}'
                        defaultValue='{"model": "gpt-4", "temperature": 1.0, "max_tokens": 1000}'
                        className="min-h-[100px]"
                        required
                        data-testid="textarea-model-config"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createEvalSpecMutation.isPending}>
                        {createEvalSpecMutation.isPending ? "Creating..." : "Create Eval Spec"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Run Dialog */}
              <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Run</DialogTitle>
                    <DialogDescription>
                      Execute this evaluation spec with a policy
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateRun} className="space-y-4">
                    <div>
                      <Label htmlFor="policyId">Policy</Label>
                      <Select name="policyId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select policy" />
                        </SelectTrigger>
                        <SelectContent>
                          {policies?.map((policy) => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="description">Description (optional)</Label>
                      <Input
                        id="description"
                        name="description"
                        placeholder={`Run for ${evalSpecs?.find(s => s.id === selectedSpecId)?.name || 'evaluation'}`}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setRunDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createRunMutation.isPending}>
                        {createRunMutation.isPending ? "Creating..." : "Create & Run"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>
        
        <div className="p-6">
          {evalSpecsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded"></div>
                      <div className="h-3 bg-muted rounded w-4/5"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : evalSpecs && evalSpecs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {evalSpecs.map((spec: any) => (
              <Card key={spec.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{spec.name}</CardTitle>
                    <Badge variant="secondary">{spec.version}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {spec.description}
                  </p>
                  <div className="space-y-2 mb-4">
                    <div className="text-sm">
                      <span className="font-medium">Evaluators:</span>{' '}
                      {spec.evaluators?.length || 0}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Repetitions:</span>{' '}
                      {spec.repetitions}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1" 
                      data-testid={`button-run-${spec.id}`}
                      onClick={() => handleRunSpec(spec.id)}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Run
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      data-testid={`button-edit-${spec.id}`}
                      onClick={() => {
                        toast({
                          title: "Coming Soon",
                          description: "Eval spec editing feature is coming soon",
                        });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-3">
                    Created {new Date(spec.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">No eval specs yet</h3>
              <p className="text-muted-foreground mb-4">Create your first evaluation specification</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Eval Spec
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
