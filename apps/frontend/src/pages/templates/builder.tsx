import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  Save
} from 'lucide-react';

export default function TemplateBuilder() {
  const { toast } = useToast();

  const [template, setTemplate] = useState(`Hello {{item.name}}, 

Please evaluate the following response:
Question: {{item.question}}
Expected Answer: {{expected.answer}}
Actual Response: {{sample.output}}

Rate the accuracy from 1-10 and provide reasoning.`);

  const [sampleContext, setSampleContext] = useState(`{
  "item": {
    "name": "John",
    "question": "What is the capital of France?"
  },
  "expected": {
    "answer": "Paris"
  },
  "sample": {
    "output": "The capital of France is Paris."
  }
}`);

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);

  // Validate template mutation
  const validateMutation = useMutation({
    mutationFn: async ({ template, sampleContext }: { template: string; sampleContext: any }) => {
      const response = await apiRequest('POST', '/api/templates/validate', { template, sampleContext });
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      setValidation(data);
    },
    onError: (error) => {
      console.error('Validation error:', error);
      setValidation(null);
    }
  });

  // Preview template mutation
  const previewMutation = useMutation({
    mutationFn: async ({ template, sampleContext }: { template: string; sampleContext: any }) => {
      const response = await apiRequest('POST', '/api/templates/preview', { template, sampleContext });
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      setPreview(data);
    },
    onError: (error) => {
      console.error('Preview error:', error);
      setPreview(null);
    }
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (templateData: { name: string; description: string; content: string }) => {
      const response = await apiRequest('POST', '/api/templates', templateData);
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Template Saved",
        description: "Your template has been saved successfully.",
      });
      setTemplateName('');
      setTemplateDescription('');
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save template. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleValidate = () => {
    let parsedContext;
    try {
      parsedContext = JSON.parse(sampleContext);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please check your sample context JSON format.",
        variant: "destructive",
      });
      return;
    }
    validateMutation.mutate({ template, sampleContext: parsedContext });
  };

  const handlePreview = () => {
    let parsedContext;
    try {
      parsedContext = JSON.parse(sampleContext);
    } catch (error) {
      toast({
        title: "Invalid JSON", 
        description: "Please check your sample context JSON format.",
        variant: "destructive",
      });
      return;
    }
    previewMutation.mutate({ template, sampleContext: parsedContext });
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast({
        title: "Name Required",
        description: "Please provide a name for your template.",
        variant: "destructive",
      });
      return;
    }

    saveTemplateMutation.mutate({
      name: templateName.trim(),
      description: templateDescription.trim(),
      content: template
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h2 className="text-2xl font-bold mb-2">Template Builder</h2>
          <p className="text-muted-foreground">
            Create and test evaluation templates with dynamic variable substitution
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Input */}
        <div className="space-y-4">
          {/* Template Editor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Template Editor
              </CardTitle>
              <CardDescription>
                Write your template using double curly braces for variables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Enter your template here..."
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="min-h-[250px] font-mono text-sm"
                data-testid="input-template"
              />
            </CardContent>
          </Card>

          {/* Sample Context */}
          <Card>
            <CardHeader>
              <CardTitle>Sample Context (JSON)</CardTitle>
              <CardDescription>
                Provide sample data to test your template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Enter sample JSON context..."
                value={sampleContext}
                onChange={(e) => setSampleContext(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                data-testid="input-context"
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleValidate}
              disabled={validateMutation.isPending}
              data-testid="button-validate"
              className="flex-1"
            >
              {validateMutation.isPending ? 'Validating...' : 'Validate'}
            </Button>
            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              variant="secondary"
              data-testid="button-preview"
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? 'Previewing...' : 'Preview'}
            </Button>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div className="space-y-4 h-fit">
          {/* Live Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Live Preview & Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preview Results */}
              {previewMutation.isPending ? (
                <div className="p-4 bg-muted rounded-md min-h-[200px] flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    Generating preview...
                  </div>
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Rendered Output:</h4>
                    <div className="p-4 bg-muted rounded-md max-h-[300px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm" data-testid="preview-output">
                        {preview.rendered || 'No output rendered'}
                      </pre>
                    </div>
                  </div>
                  
                  {preview.missing && preview.missing.length > 0 && (
                    <Alert>
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Unresolved Variables:</strong> {preview.missing.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-md min-h-[200px] flex items-center justify-center text-muted-foreground">
                  Click "Preview" to see your template rendered with sample data
                </div>
              )}

              {/* Validation Results */}
              {validateMutation.isPending ? (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    Validating template...
                  </div>
                </div>
              ) : validation && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    {validation.isValid ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    Validation Status
                  </h4>
                  
                  {validation.variables && validation.variables.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm text-muted-foreground mb-2">Variables Found:</p>
                      <div className="flex flex-wrap gap-1">
                        {validation.variables.map((variable: string) => (
                          <Badge key={variable} variant="outline" className="text-xs" data-testid={`variable-${variable}`}>
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {validation.missing && validation.missing.length > 0 ? (
                    <Alert>
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Missing Variables:</strong> {validation.missing.join(', ')}
                      </AlertDescription>
                    </Alert>
                  ) : validation.isValid && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Template is valid! All variables can be resolved.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Template */}
          {validation?.isValid && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Save className="h-5 w-5" />
                  Save Template
                </CardTitle>
                <CardDescription>
                  Save your validated template for use in evaluation specs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Template Name</label>
                  <Input
                    placeholder="Enter template name..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    data-testid="input-template-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Description (optional)</label>
                  <Textarea
                    placeholder="Describe what this template is used for..."
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="input-template-description"
                  />
                </div>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={saveTemplateMutation.isPending || !templateName.trim()}
                  className="w-full"
                  data-testid="button-save-template"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}