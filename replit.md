# EvalOps Control Plane

## Overview

EvalOps is a "SonarQube for AI" platform that enforces measurable quality gates on LLM features through evaluators, datasets, and policies. This TypeScript-based MVP provides a control plane for managing AI evaluation workflows, ensuring reproducible and statistically rigorous assessment of AI systems. The platform enables teams to register prompts/flows, datasets, and evaluation specifications, execute runs with pass/warn/fail decisions based on policies, and maintain auditable decision logs with baseline drift detection.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18 with TypeScript**: Modern React application using functional components and hooks
- **Wouter for Routing**: Lightweight client-side routing solution
- **TanStack Query**: Server state management with caching and synchronization
- **Shadcn/ui Components**: Radix-based component library with Tailwind CSS styling
- **Vite Build System**: Fast development server and optimized production builds

### Backend Architecture
- **Express.js Server**: RESTful API server with TypeScript support
- **Drizzle ORM**: Type-safe PostgreSQL database layer with schema-first approach
- **Session-based Authentication**: PostgreSQL-backed sessions with passport.js integration
- **Replit Auth Integration**: Built-in authentication system for Replit environment

### Database Design
- **PostgreSQL with Drizzle**: Relational database using Neon serverless PostgreSQL
- **Core Entities**: Users, Organizations, Prompts, Flows, Datasets, Evaluation Specs, Runs, Baselines, Policies
- **Audit Trail**: Comprehensive change tracking with user attribution
- **Immutable Artifacts**: Content-based versioning with hash-based deduplication

### Evaluation Engine
- **Multi-evaluator Support**: Exact match, schema validation, and LLM-as-judge evaluators
- **Statistical Rigor**: Minimum 3 repetitions with confidence intervals and bootstrap sampling
- **Deterministic Execution**: Fixed random seeds and reproducible configurations
- **Cost and Performance Tracking**: Latency metrics and token usage monitoring

### Policy Engine
- **Declarative Policies**: JSON-based rule definitions with threshold and regression tests
- **Quality Gates**: Pass/warn/fail decisions with evidence-based reporting
- **Baseline Comparison**: Statistical significance testing against versioned baselines
- **Violation Tracking**: Detailed policy violation logs with remediation guidance

### External Integrations
- **Azure OpenAI/OpenAI API**: Model inference with cost tracking and error handling
- **Azure Prompt Flow**: External pipeline execution with input/output capture
- **CI/CD Hooks**: GitHub integration for automated evaluation in development workflows

### Security and Access Control
- **Role-based Access**: Admin, Editor, Viewer roles at organization level
- **Secure Secrets Management**: Environment-based configuration for API keys and endpoints
- **Session Security**: HTTP-only cookies with CSRF protection

### Development Architecture
- **Monorepo Structure**: Shared TypeScript types between client and server
- **Hot Module Replacement**: Development-time code reloading with Vite
- **Type Safety**: End-to-end TypeScript with Zod schema validation
- **Error Handling**: Centralized error management with user-friendly messaging

## External Dependencies

### Database and Storage
- **Neon Serverless PostgreSQL**: Primary data persistence with connection pooling
- **Replit File Storage**: Artifact and run output storage for MVP phase

### Authentication and Session Management
- **Replit OIDC**: Identity provider integration with automatic user provisioning
- **PostgreSQL Sessions**: Session storage using connect-pg-simple

### AI and ML Services
- **Azure OpenAI Service**: GPT model access for LLM-as-judge evaluations
- **OpenAI API**: Alternative model provider with same interface
- **Azure Machine Learning**: Prompt Flow workspace integration for pipeline execution

### Development and Build Tools
- **Vite**: Frontend build system with TypeScript and React support
- **Drizzle Kit**: Database migration and schema management
- **ESBuild**: Server-side bundling for production deployment

### UI and Styling
- **Tailwind CSS**: Utility-first CSS framework with design system tokens
- **Radix UI**: Headless component primitives for accessibility
- **Lucide React**: Icon library for consistent visual elements

### Monitoring and Observability
- **Custom Logging**: Request/response logging with performance metrics
- **Error Tracking**: Client and server-side error capture and reporting