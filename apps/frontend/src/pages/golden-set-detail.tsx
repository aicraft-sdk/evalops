import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, ArrowLeft, PlayCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GoldenSet {
  id: string;
  name: string;
  description: string | null;
}

interface GoldenSetExample {
  id: string;
  input: unknown;
  output: unknown;
  expected: unknown;
  context: unknown;
  humanLabel: boolean;
  humanReasoning: string | null;
  isBadExample: boolean;
}

interface Disagreement {
  exampleId: string;
  humanLabel: boolean;
  judgeLabel: boolean;
  judgeScore: number;
  judgeReasoning?: string;
}

interface CalibrationRun {
  id: string;
  judgeEvaluator: string;
  judgeThreshold: number;
  agreementRate: number;
  kappa: number | null;
  isCalibrated: boolean;
  isReliable: boolean;
  sampleCount: number;
  disagreements: { items: Disagreement[]; excludedCount: number } | null;
  createdAt: string | null;
}

// The 12 judge-evaluator method keys CalibrationService.scoreExample()
// dispatches on (apps/evaluation-service/.../calibration.service.ts) - kept
// in sync with that switch statement's case labels.
const JUDGE_EVALUATOR_OPTIONS: { value: string; label: string }[] = [
  { value: "llm_as_judge", label: "LLM as Judge" },
  { value: "factuality", label: "Factuality" },
  { value: "security", label: "Security" },
  { value: "answer_relevancy", label: "Answer Relevancy" },
  { value: "faithfulness", label: "Faithfulness" },
  { value: "answer_correctness", label: "Answer Correctness" },
  { value: "battle", label: "Battle" },
  { value: "context_precision", label: "Context Precision" },
  { value: "context_recall", label: "Context Recall" },
  { value: "context_relevancy", label: "Context Relevancy" },
  { value: "pii_detection", label: "PII Detection" },
  { value: "jailbreak_detection", label: "Jailbreak Detection" },
];

function stringifyField(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function GoldenSetDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [isAddExampleOpen, setIsAddExampleOpen] = useState(false);
  const [judgeEvaluator, setJudgeEvaluator] = useState<string>("");
  const [judgeThreshold, setJudgeThreshold] = useState<string>("0.5");
  const [humanLabel, setHumanLabel] = useState(true);
  const [isBadExample, setIsBadExample] = useState(false);

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

  const { data: goldenSets } = useQuery<GoldenSet[]>({
    queryKey: ["/api/golden-sets"],
    enabled: isAuthenticated,
  });
  const goldenSet = goldenSets?.find((g) => g.id === id);

  const { data: examples, isLoading: examplesLoading } = useQuery<GoldenSetExample[]>({
    queryKey: [`/api/golden-sets/${id}/examples`],
    enabled: isAuthenticated && !!id,
  });

  const { data: calibrationRuns } = useQuery<CalibrationRun[]>({
    queryKey: [`/api/golden-sets/${id}/calibration-runs`],
    enabled: isAuthenticated && !!id,
  });
  // listCalibrationRuns is ordered `desc(createdAt)` server-side, so the
  // first element is always the latest run.
  const latestReport = calibrationRuns?.[0];

  const addExampleMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", `/api/golden-sets/${id}/examples`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/golden-sets/${id}/examples`] });
      setIsAddExampleOpen(false);
      setHumanLabel(true);
      setIsBadExample(false);
      toast({ title: "Example added", description: "The example was added to this golden set." });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add example",
        variant: "destructive",
      });
    },
  });

  const runCalibrationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/golden-sets/${id}/calibration-runs`, {
        judgeEvaluator,
        judgeThreshold: judgeThreshold ? parseFloat(judgeThreshold) : undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/golden-sets/${id}/calibration-runs`] });
      toast({
        title: "Calibration run complete",
        description: "The latest calibration report has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run calibration",
        variant: "destructive",
      });
    },
  });

  const handleAddExample = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const contextRaw = (formData.get("context") as string) || "";
    const context = contextRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    addExampleMutation.mutate({
      input: (formData.get("input") as string) || undefined,
      output: formData.get("output") as string,
      expected: (formData.get("expected") as string) || undefined,
      context: context.length > 0 ? context : undefined,
      humanLabel,
      humanReasoning: (formData.get("humanReasoning") as string) || undefined,
      isBadExample,
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
          <Link href="/golden-sets" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="w-4 h-4" />
            Golden Sets
          </Link>
          <h1 className="text-2xl font-semibold" data-testid="text-golden-set-detail-title">
            {goldenSet?.name ?? "Golden Set"}
          </h1>
          {goldenSet?.description && (
            <p className="text-muted-foreground">{goldenSet.description}</p>
          )}
        </header>

        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Examples ({examples?.length ?? 0})</CardTitle>
                <Dialog open={isAddExampleOpen} onOpenChange={setIsAddExampleOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-example">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Example
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add Example</DialogTitle>
                      <DialogDescription>
                        Add a human-labeled example to this golden set.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddExample} className="space-y-4">
                      <div>
                        <Label htmlFor="input">Input</Label>
                        <Textarea id="input" name="input" data-testid="textarea-example-input" />
                      </div>
                      <div>
                        <Label htmlFor="output">Output</Label>
                        <Textarea
                          id="output"
                          name="output"
                          required
                          data-testid="textarea-example-output"
                        />
                      </div>
                      <div>
                        <Label htmlFor="expected">Expected</Label>
                        <Textarea
                          id="expected"
                          name="expected"
                          data-testid="textarea-example-expected"
                        />
                      </div>
                      <div>
                        <Label htmlFor="context">Context (comma-separated)</Label>
                        <Textarea
                          id="context"
                          name="context"
                          data-testid="textarea-example-context"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="humanLabel">Human label: good response</Label>
                        <Switch
                          id="humanLabel"
                          checked={humanLabel}
                          onCheckedChange={setHumanLabel}
                          data-testid="switch-human-label"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="isBadExample"
                          checked={isBadExample}
                          onCheckedChange={(checked) => setIsBadExample(checked === true)}
                          data-testid="checkbox-is-bad-example"
                        />
                        <Label htmlFor="isBadExample">
                          This is a deliberately bad example (needed for judge discernment)
                        </Label>
                      </div>
                      <div>
                        <Label htmlFor="humanReasoning">Human reasoning</Label>
                        <Textarea
                          id="humanReasoning"
                          name="humanReasoning"
                          data-testid="textarea-human-reasoning"
                        />
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsAddExampleOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={addExampleMutation.isPending}
                          data-testid="button-submit-example"
                        >
                          {addExampleMutation.isPending ? "Adding..." : "Add Example"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {examplesLoading ? (
                <p className="text-muted-foreground">Loading examples...</p>
              ) : examples && examples.length > 0 ? (
                <Table data-testid="table-examples">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Input</TableHead>
                      <TableHead>Output</TableHead>
                      <TableHead>Human Label</TableHead>
                      <TableHead>Bad?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examples.map((example) => (
                      <TableRow key={example.id} data-testid={`row-example-${example.id}`}>
                        <TableCell className="max-w-xs truncate">
                          {stringifyField(example.input)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {stringifyField(example.output)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={example.humanLabel ? "default" : "destructive"}>
                            {example.humanLabel ? "Good" : "Bad"}
                          </Badge>
                        </TableCell>
                        <TableCell>{example.isBadExample ? "Yes" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">No examples yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Run Calibration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <Label htmlFor="judgeEvaluator">Judge evaluator</Label>
                  <Select value={judgeEvaluator} onValueChange={setJudgeEvaluator}>
                    <SelectTrigger data-testid="select-judge-evaluator">
                      <SelectValue placeholder="Choose a judge evaluator" />
                    </SelectTrigger>
                    <SelectContent>
                      {JUDGE_EVALUATOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label htmlFor="judgeThreshold">Threshold</Label>
                  <Input
                    id="judgeThreshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={judgeThreshold}
                    onChange={(e) => setJudgeThreshold(e.target.value)}
                    data-testid="input-judge-threshold"
                  />
                </div>
                <Button
                  data-testid="button-run-calibration"
                  disabled={!judgeEvaluator || runCalibrationMutation.isPending}
                  onClick={() => runCalibrationMutation.mutate()}
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {runCalibrationMutation.isPending ? "Running..." : "Run Calibration"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Latest Report</CardTitle>
            </CardHeader>
            <CardContent>
              {latestReport ? (
                <div className="space-y-4" data-testid="calibration-report">
                  <div className="flex items-center gap-4">
                    <span data-testid="text-agreement-rate">
                      Agreement: {(latestReport.agreementRate * 100).toFixed(0)}%
                    </span>
                    {latestReport.isReliable ? (
                      <span data-testid="text-kappa">
                        κ={latestReport.kappa?.toFixed(2) ?? "—"}
                      </span>
                    ) : (
                      <span data-testid="text-insufficient-examples" className="text-muted-foreground">
                        insufficient examples ({latestReport.sampleCount} sample
                        {latestReport.sampleCount === 1 ? "" : "s"})
                      </span>
                    )}
                    <Badge
                      variant={latestReport.isCalibrated ? "default" : "destructive"}
                      data-testid="badge-calibration-status"
                    >
                      {latestReport.isCalibrated ? "Calibrated" : "Uncalibrated"}
                    </Badge>
                  </div>

                  {latestReport.disagreements && latestReport.disagreements.items.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        Disagreements ({latestReport.disagreements.items.length})
                      </h4>
                      <Table data-testid="table-disagreements">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Example</TableHead>
                            <TableHead>Human</TableHead>
                            <TableHead>Judge</TableHead>
                            <TableHead>Judge Reasoning</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {latestReport.disagreements.items.map((d) => (
                            <TableRow key={d.exampleId} data-testid={`row-disagreement-${d.exampleId}`}>
                              <TableCell>{d.exampleId}</TableCell>
                              <TableCell>{d.humanLabel ? "Good" : "Bad"}</TableCell>
                              <TableCell>{d.judgeLabel ? "Good" : "Bad"}</TableCell>
                              <TableCell className="max-w-sm truncate">
                                {d.judgeReasoning ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No disagreements</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No calibration runs yet. Select a judge evaluator and run calibration.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
