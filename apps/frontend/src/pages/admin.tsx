import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/layout/sidebar";
import { 
  Users, 
  Shield, 
  Key, 
  Settings, 
  Plus,
  UserPlus,
  Crown,
  Lock,
  Unlock,
  AlertCircle,
  Check,
  X,
  Search
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  jobTitle?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  priority: number;
  createdAt: string;
}

export default function Admin() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showCreateRoleDialog, setShowCreateRoleDialog] = useState(false);
  const [showAssignRoleDialog, setShowAssignRoleDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
  });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery<unknown[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const createRoleMutation = useMutation({
    mutationFn: async (roleData: any) => {
      const response = await apiRequest("POST", "/api/admin/roles", roleData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      setShowCreateRoleDialog(false);
      toast({
        title: "Role Created",
        description: "New role has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create role",
        variant: "destructive",
      });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/roles/${roleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audit-logs"] });
      setShowAssignRoleDialog(false);
      toast({
        title: "Role Assigned",
        description: "Role has been assigned successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive",
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/status`, { isActive });
      return response.json();
    },
    onSuccess: (_data, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: isActive ? "User Activated" : "User Deactivated",
        description: `User has been ${isActive ? 'activated' : 'deactivated'} successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    },
  });

  const handleCreateRole = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    createRoleMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      priority: parseInt(formData.get("priority") as string) || 1,
    });
  };

  const handleAssignRole = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const roleId = formData.get("roleId") as string;
    
    if (selectedUserId && roleId) {
      assignRoleMutation.mutate({ userId: selectedUserId, roleId });
    }
  };

  const isLoading = usersLoading || rolesLoading;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-admin-title">Administration</h1>
              <p className="text-muted-foreground">Manage users, roles, and permissions</p>
            </div>
            <div className="flex items-center gap-3">
              <Dialog open={showCreateRoleDialog} onOpenChange={setShowCreateRoleDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-role">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Role
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Role</DialogTitle>
                    <DialogDescription>
                      Define a new role with specific permissions for your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateRole} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Role Name</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Data Scientist"
                        required
                        data-testid="input-role-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Can create and run evaluations, manage datasets"
                        data-testid="textarea-role-description"
                      />
                    </div>
                    <div>
                      <Label htmlFor="priority">Priority Level</Label>
                      <Select name="priority">
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="100">High (Admin level)</SelectItem>
                          <SelectItem value="50">Medium (Editor level)</SelectItem>
                          <SelectItem value="20">Low (Viewer level)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowCreateRoleDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createRoleMutation.isPending}>
                        {createRoleMutation.isPending ? "Creating..." : "Create Role"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card data-testid="card-total-users">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
                <p className="text-xs text-muted-foreground">
                  {users.filter((u: User) => u.isActive).length} active
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-total-roles">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Roles</CardTitle>
                <Shield className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roles.length}</div>
                <p className="text-xs text-muted-foreground">
                  {roles.filter((r: Role) => r.isSystemRole).length} system roles
                </p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-recent-logins">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Logins</CardTitle>
                <Key className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter((u: User) => {
                    const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt) : null;
                    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return lastLogin && lastLogin > dayAgo;
                  }).length}
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
            
            <Card data-testid="card-audit-events">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Audit Events</CardTitle>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{auditLogs.length}</div>
                <p className="text-xs text-muted-foreground">Recent changes</p>
              </CardContent>
            </Card>
          </div>

          {/* Users Management */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  User Management
                </CardTitle>
                <CardDescription>
                  Manage user accounts and permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-4">Loading users...</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {users.map((user: User) => (
                      <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`user-${user.id}`}>
                        <div className="flex-1">
                          <div className="font-medium">{user.firstName} {user.lastName}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                          {user.department && (
                            <div className="text-xs text-muted-foreground">{user.department} • {user.jobTitle}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={user.isActive ? "default" : "secondary"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUserStatusMutation.mutate({ 
                              userId: user.id, 
                              isActive: !user.isActive 
                            })}
                            data-testid={`button-toggle-${user.id}`}
                          >
                            {user.isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </Button>
                          <Dialog open={showAssignRoleDialog && selectedUserId === user.id} onOpenChange={(open) => {
                            setShowAssignRoleDialog(open);
                            if (!open) setSelectedUserId(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedUserId(user.id)}
                                data-testid={`button-assign-role-${user.id}`}
                              >
                                <Crown className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Assign Role</DialogTitle>
                                <DialogDescription>
                                  Assign a role to {user.firstName} {user.lastName}
                                </DialogDescription>
                              </DialogHeader>
                              <form onSubmit={handleAssignRole} className="space-y-4">
                                <div>
                                  <Label htmlFor="roleId">Select Role</Label>
                                  <Select name="roleId" required>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Choose a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {roles.map((role: Role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                          <div className="flex flex-col">
                                            <span className="font-medium">{role.name}</span>
                                            <span className="text-xs text-muted-foreground">{role.description}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" onClick={() => setShowAssignRoleDialog(false)}>
                                    Cancel
                                  </Button>
                                  <Button type="submit" disabled={assignRoleMutation.isPending}>
                                    {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
                                  </Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Roles Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Role Management
                </CardTitle>
                <CardDescription>
                  Configure roles and their permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-4">Loading roles...</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {roles.map((role: Role) => (
                      <div key={role.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`role-${role.id}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            {role.isSystemRole && (
                              <Badge variant="outline" className="text-xs">System</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{role.description}</div>
                          <div className="text-xs text-muted-foreground">Priority: {role.priority}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" data-testid={`button-edit-role-${role.id}`}>
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Microsoft Entra ID Integration Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Microsoft Entra ID Integration
              </CardTitle>
              <CardDescription>
                Enterprise Single Sign-On configuration and status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <div>
                    <div className="font-medium">Integration Active</div>
                    <div className="text-sm text-muted-foreground">
                      Users can sign in with Microsoft Entra ID credentials
                    </div>
                  </div>
                </div>
                <Badge variant="default">Configured</Badge>
              </div>
              <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                <p>• Automatic user provisioning from Entra ID</p>
                <p>• Role mapping based on department and job title</p>
                <p>• Audit logging for all authentication events</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}