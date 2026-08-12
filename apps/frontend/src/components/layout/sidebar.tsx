import { Link, useLocation } from "wouter";
import { CheckCircle, LayoutDashboard, TrendingUp, Archive, ClipboardList, Zap, Shield, FileText, Moon, Sun, Database, Menu, X, Settings, Code, ChevronDown, ChevronRight, DollarSign, Package, Users, Cpu, Bot, AlertCircle, ClipboardCheck } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavigationItem {
  name: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavigationItem[];
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    name: "Data Management",
    icon: Database,
    children: [
      { name: "Datasets", href: "/datasets", icon: Database },
      { name: "Prompts", href: "/prompts", icon: Archive },
      { name: "Agents", href: "/agents", icon: Bot },
      { name: "Templates", href: "/templates", icon: Code },
    ]
  },
  { 
    name: "Evaluations", 
    icon: ClipboardList,
    children: [
      { name: "Eval Specs", href: "/eval-specs", icon: ClipboardList },
      { name: "Advanced Evals", href: "/advanced-evals", icon: Cpu },
      { name: "Runs", href: "/runs", icon: Zap },
      { name: "Simulations", href: "/simulations", icon: Bot },
      { name: "Custom Evaluators", href: "/custom-evaluators", icon: Settings },
      { name: "Review Queue", href: "/review-queue", icon: AlertCircle },
    ]
  },
  { 
    name: "Analytics", 
    icon: TrendingUp,
    children: [
      { name: "Overview", href: "/analytics", icon: TrendingUp },
      { name: "Cost Analytics", href: "/cost-analytics", icon: DollarSign },
    ]
  },
  { 
    name: "Configuration", 
    icon: Settings,
    children: [
      { name: "Providers", href: "/providers", icon: Users },
      { name: "Policies", href: "/policies", icon: Shield },
      { name: "Golden Sets", href: "/golden-sets", icon: ClipboardCheck },
      { name: "Model Registry", href: "/model-registry", icon: Package },
    ]
  },
  { 
    name: "System", 
    icon: FileText,
    children: [
      { name: "Audit Trail", href: "/audit-trail", icon: FileText },
      { name: "Settings", href: "/settings", icon: Settings },
    ]
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['Evaluations', 'Data Management']); // Auto-expand main menus

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)}>
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <nav className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ease-in-out`} data-testid="sidebar-navigation">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-sidebar-foreground">EvalOps</h1>
            <p className="text-xs text-sidebar-foreground/70">Control Plane</p>
          </div>
          {/* Close button for mobile */}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto md:hidden p-1"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Navigation Links */}
      <div className="flex-1 px-4 py-4">
        <div className="space-y-2">
          {navigation.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedItems.includes(item.name);
            const isActive = item.href ? location === item.href : false;
            const hasActiveChild = hasChildren && item.children?.some(child => child.href === location) || false;
            
            if (hasChildren) {
              return (
                <div key={item.name}>
                  {/* Parent Menu Item */}
                  <button
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-left",
                      hasActiveChild
                        ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                    onClick={() => {
                      setExpandedItems(prev => 
                        prev.includes(item.name) 
                          ? prev.filter(name => name !== item.name)
                          : [...prev, item.name]
                      );
                    }}
                    data-testid={`nav-parent-${item.name.toLowerCase().replace(" ", "-")}`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="flex-1">{item.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  
                  {/* Child Menu Items */}
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children!.map((child) => {
                        const childIsActive = location === child.href;
                        return (
                          <Link
                            key={child.name}
                            href={child.href!}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-sm",
                              childIsActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                            )}
                            data-testid={`nav-link-${child.name.toLowerCase().replace(" ", "-")}`}
                            onClick={() => setIsOpen(false)}
                          >
                            <child.icon className="w-4 h-4" />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <Link 
                key={item.name} 
                href={item.href!}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
                data-testid={`nav-link-${item.name.toLowerCase().replace(" ", "-")}`}
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Theme Toggle and User Info */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-sidebar-foreground/70">Theme</span>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={toggleTheme}
            className="p-1 h-auto text-sidebar-foreground hover:bg-sidebar-accent"
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-sidebar-accent-foreground">
                {(user as any).firstName?.charAt(0) || (user as any).email?.charAt(0) || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-sidebar-foreground">
                {(user as any).firstName && (user as any).lastName 
                  ? `${(user as any).firstName} ${(user as any).lastName}` 
                  : (user as any).email
                }
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate">
                {(user as any).role} • {(user as any).organizationId ? 'Organization' : 'Personal'}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
    </>
  );
}
