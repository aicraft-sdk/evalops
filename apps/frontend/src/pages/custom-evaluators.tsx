import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'wouter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { queryClient, apiRequest } from '@/lib/queryClient'
import { 
  Upload, 
  Plus, 
  FileText, 
  Settings, 
  Trash2, 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Filter,
  Search,
  Tag
} from 'lucide-react'

interface CustomEvaluator {
  id: string
  name: string
  description?: string
  version: string
  evaluatorType: string
  fileName: string
  fileSize: number
  status: 'active' | 'disabled' | 'pending_validation' | 'validation_failed'
  tags: string[]
  isPublic: boolean
  organizationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  validationResults?: any
  validationError?: string
  usage?: any
}

interface EvaluatorUsage {
  totalExecutions: number
  successRate: number
  avgExecutionTime: number
  totalCost: number
  usageOverTime: any[]
}

export default function CustomEvaluators() {
  const { toast } = useToast()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [selectedEvaluator, setSelectedEvaluator] = useState<CustomEvaluator | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    evaluatorType: 'custom',
    tags: [] as string[],
    isPublic: false
  })

  // Fetch custom evaluators
  const { data: evaluators = [], isLoading, refetch } = useQuery<CustomEvaluator[]>({
    queryKey: ['/api/custom-evaluators'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (typeFilter !== 'all') params.append('evaluatorType', typeFilter)
      params.append('includePublic', 'true')

      const response = await fetch(`/api/custom-evaluators?${params}`)
      if (!response.ok) throw new Error('Failed to fetch evaluators')
      return (await response.json()) as CustomEvaluator[]
    }
  })

  // Upload evaluator mutation
  const uploadEvaluator = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/custom-evaluators/upload', {
        method: 'POST',
        body: formData
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to upload evaluator')
      }
      return response.json()
    },
    onSuccess: () => {
      toast({
        title: 'Evaluator Uploaded',
        description: 'Your custom evaluator has been uploaded and is being validated.',
      })
      setIsUploadDialogOpen(false)
      setSelectedFile(null)
      setUploadForm({
        name: '',
        description: '',
        evaluatorType: 'custom',
        tags: [],
        isPublic: false
      })
      queryClient.invalidateQueries({ queryKey: ['/api/custom-evaluators'] })
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Update evaluator mutation
  const updateEvaluator = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CustomEvaluator> }) => {
      return apiRequest('PUT', `/api/custom-evaluators/${id}`, updates)
    },
    onSuccess: () => {
      toast({
        title: 'Evaluator Updated',
        description: 'Your evaluator settings have been updated.',
      })
      setIsSettingsDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['/api/custom-evaluators'] })
    }
  })

  // Delete evaluator mutation
  const deleteEvaluator = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/custom-evaluators/${id}`)
    },
    onSuccess: () => {
      toast({
        title: 'Evaluator Deleted',
        description: 'The evaluator has been removed from your registry.',
      })
      queryClient.invalidateQueries({ queryKey: ['/api/custom-evaluators'] })
    }
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.py')) {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a Python (.py) file.',
          variant: 'destructive'
        })
        return
      }
      if (file.size > 100 * 1024) {
        toast({
          title: 'File Too Large',
          description: 'Maximum file size is 100KB.',
          variant: 'destructive'
        })
        return
      }
      setSelectedFile(file)
      if (!uploadForm.name) {
        setUploadForm(prev => ({
          ...prev,
          name: file.name.replace('.py', '')
        }))
      }
    }
  }

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: 'No File Selected',
        description: 'Please select a Python file to upload.',
        variant: 'destructive'
      })
      return
    }

    const formData = new FormData()
    formData.append('evaluator', selectedFile)
    formData.append('name', uploadForm.name)
    formData.append('description', uploadForm.description)
    formData.append('evaluatorType', uploadForm.evaluatorType)
    formData.append('tags', JSON.stringify(uploadForm.tags))
    formData.append('isPublic', uploadForm.isPublic.toString())

    uploadEvaluator.mutate(formData)
  }

  const handleTagInput = (value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(Boolean)
    setUploadForm(prev => ({ ...prev, tags }))
  }

  const getStatusIcon = (status: CustomEvaluator['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'disabled':
        return <XCircle className="w-4 h-4 text-gray-500" />
      case 'pending_validation':
        return <Clock className="w-4 h-4 text-yellow-600" />
      case 'validation_failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: CustomEvaluator['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'disabled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
      case 'pending_validation':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'validation_failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  // Filter evaluators
  const filteredEvaluators = evaluators.filter(evaluator => {
    const matchesSearch = evaluator.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         evaluator.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || evaluator.status === statusFilter
    const matchesType = typeFilter === 'all' || evaluator.evaluatorType === typeFilter
    return matchesSearch && matchesStatus && matchesType
  })

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-custom-evaluators">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-custom-evaluators-title">
            Custom Evaluator Registry
          </h1>
          <p className="text-muted-foreground mt-2">
            Upload and manage your own Python evaluators for custom evaluation logic
          </p>
        </div>
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-upload-evaluator">
              <Upload className="w-4 h-4 mr-2" />
              Upload Evaluator
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md" data-testid="dialog-upload-evaluator">
            <DialogHeader>
              <DialogTitle>Upload Custom Evaluator</DialogTitle>
              <DialogDescription>
                Upload a Python (.py) file containing your custom evaluation logic
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="evaluator-file">Python File</Label>
                <Input
                  id="evaluator-file"
                  type="file"
                  accept=".py"
                  onChange={handleFileSelect}
                  data-testid="input-evaluator-file"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="evaluator-name">Name</Label>
                <Input
                  id="evaluator-name"
                  value={uploadForm.name}
                  onChange={e => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter evaluator name"
                  data-testid="input-evaluator-name"
                />
              </div>

              <div>
                <Label htmlFor="evaluator-description">Description (Optional)</Label>
                <Textarea
                  id="evaluator-description"
                  value={uploadForm.description}
                  onChange={e => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this evaluator does"
                  rows={3}
                  data-testid="textarea-evaluator-description"
                />
              </div>

              <div>
                <Label htmlFor="evaluator-type">Type</Label>
                <Select 
                  value={uploadForm.evaluatorType} 
                  onValueChange={value => setUploadForm(prev => ({ ...prev, evaluatorType: value }))}
                >
                  <SelectTrigger data-testid="select-evaluator-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="similarity">Similarity</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="grading">Grading</SelectItem>
                    <SelectItem value="fact_checking">Fact Checking</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="evaluator-tags">Tags (comma-separated)</Label>
                <Input
                  id="evaluator-tags"
                  value={uploadForm.tags.join(', ')}
                  onChange={e => handleTagInput(e.target.value)}
                  placeholder="nlp, semantic, custom"
                  data-testid="input-evaluator-tags"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="evaluator-public"
                  checked={uploadForm.isPublic}
                  onCheckedChange={checked => setUploadForm(prev => ({ ...prev, isPublic: checked }))}
                  data-testid="switch-evaluator-public"
                />
                <Label htmlFor="evaluator-public">Make public (share with other organizations)</Label>
              </div>

              <Button 
                onClick={handleUpload} 
                disabled={!selectedFile || !uploadForm.name || uploadEvaluator.isPending}
                className="w-full"
                data-testid="button-confirm-upload"
              >
                {uploadEvaluator.isPending ? 'Uploading...' : 'Upload Evaluator'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search evaluators..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-evaluators"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_validation">Pending</SelectItem>
                <SelectItem value="validation_failed">Failed</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="similarity">Similarity</SelectItem>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="grading">Grading</SelectItem>
                <SelectItem value="fact_checking">Fact Checking</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Evaluators Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEvaluators.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Custom Evaluators</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' 
                ? 'No evaluators match your filters.'
                : 'Upload your first custom evaluator to get started.'}
            </p>
            {!searchTerm && statusFilter === 'all' && typeFilter === 'all' && (
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Evaluator
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvaluators.map(evaluator => (
            <Card key={evaluator.id} className="hover:shadow-md transition-shadow" data-testid={`card-evaluator-${evaluator.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getStatusIcon(evaluator.status)}
                      {evaluator.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {evaluator.description || 'No description provided'}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedEvaluator(evaluator)
                      setIsSettingsDialogOpen(true)
                    }}
                    data-testid={`button-settings-${evaluator.id}`}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className={getStatusColor(evaluator.status)}>
                      {evaluator.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      v{evaluator.version}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span>{evaluator.evaluatorType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span>{(evaluator.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                    {evaluator.isPublic && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Visibility:</span>
                        <Badge variant="outline" className="text-xs">Public</Badge>
                      </div>
                    )}
                  </div>

                  {evaluator.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {evaluator.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {evaluator.status === 'validation_failed' && evaluator.validationError && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                      {evaluator.validationError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="flex-1"
                      data-testid={`button-view-usage-${evaluator.id}`}
                    >
                      <Link href={`/custom-evaluators/${evaluator.id}/usage`}>
                        <Activity className="w-4 h-4 mr-1" />
                        Usage
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteEvaluator.mutate(evaluator.id)}
                      disabled={deleteEvaluator.isPending}
                      data-testid={`button-delete-${evaluator.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-evaluator-settings">
          <DialogHeader>
            <DialogTitle>Evaluator Settings</DialogTitle>
            <DialogDescription>
              Update metadata for {selectedEvaluator?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedEvaluator && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="settings-name">Name</Label>
                <Input
                  id="settings-name"
                  defaultValue={selectedEvaluator.name}
                  data-testid="input-settings-name"
                />
              </div>
              <div>
                <Label htmlFor="settings-description">Description</Label>
                <Textarea
                  id="settings-description"
                  defaultValue={selectedEvaluator.description || ''}
                  rows={3}
                  data-testid="textarea-settings-description"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="settings-public"
                  defaultChecked={selectedEvaluator.isPublic}
                  data-testid="switch-settings-public"
                />
                <Label htmlFor="settings-public">Make public</Label>
              </div>
              <Button 
                onClick={() => {
                  // Implementation for updating evaluator settings
                  setIsSettingsDialogOpen(false)
                }} 
                className="w-full"
                data-testid="button-save-settings"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}