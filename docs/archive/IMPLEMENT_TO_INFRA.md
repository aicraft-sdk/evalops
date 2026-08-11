# EvalOps — Integration to AInfra

## Role in AInfra
**Integration pattern:** Standalone service, called via HTTP hooks
**Port:** 3002

EvalOps is the **quality assurance layer** for all AI agents. AInfra calls it to evaluate agent responses, gate deployments, and run adversarial tests.

## What Exists Today
- 7 microservices (Gateway, Auth, Core, Evaluation, Integration, Analytics, Frontend)
- Evaluation engine (exact match, rule-based, LLM-as-judge)
- Policy engine (quality gates with pass/warn/fail)
- Trace ingestion SDK
- Cost analytics
- Python worker for advanced evaluations
- Helm charts for Kubernetes

## What's Missing for AInfra Integration

### 1. Evaluation Hook in AInfra Orchestrator
**Priority:** HIGH
**Effort:** Small

AInfra's `evaluation-core` lib already exists but needs wiring to EvalOps API.

- [ ] Implement `EvaluationHookService` that sends sampled responses to EvalOps
- [ ] Configure sampling rate (e.g., evaluate 10% of responses in production)
- [ ] Map AInfra's agent trace format to EvalOps trace format
- [ ] Add `EVALOPS_URL=http://localhost:3002` to AInfra's `.env`

### 2. Pre-deployment Agent Evaluation
**Priority:** HIGH
**Effort:** Medium

When a prompt version changes in AInfra's `PromptGovernanceService`, run EvalOps evaluation before promoting to production.

- [ ] Create evaluation dataset per agent (golden Q&A pairs)
- [ ] Add CI/CD step: prompt change → EvalOps evaluation → pass/fail gate
- [ ] Integrate with PromptGovernance A/B testing (version A vs version B)

### 3. Add AInfra-Specific Evaluators
**Priority:** MEDIUM
**Effort:** Medium

Create evaluators for AInfra's domain:
- [ ] **Context relevance evaluator** — Are RAG chunks relevant to the query?
- [ ] **Memory accuracy evaluator** — Are org memory facts used correctly?
- [ ] **Policy compliance evaluator** — Does the response violate any SHIELD policy?
- [ ] **Fraud domain evaluator** — Domain-specific accuracy for fraud-related queries

### 4. Docker Compose Entry
**Priority:** MEDIUM
**Effort:** Small

- [ ] Add EvalOps services to AInfra's `docker-compose.yml` (or a separate `docker-compose.evalops.yml` for optional startup)
- [ ] Configure shared Postgres database or separate instance

### 5. Analytics Feed
**Priority:** LOW
**Effort:** Small

- [ ] Feed EvalOps results into AInfra's `memory_events` table for unified analytics
- [ ] Show evaluation scores in AInfra's dashboard

## Verification
- [ ] AInfra sends sampled responses to EvalOps
- [ ] EvalOps returns quality scores
- [ ] Prompt version changes trigger evaluation before promotion
- [ ] Dashboard shows evaluation metrics
