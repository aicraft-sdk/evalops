# Cleanup Guide

## Old Express.js Server Code

The old Express.js server code in the `server/` directory has been fully migrated to NestJS microservices. The directory can be safely removed after verification.

### Migration Status

All code from `server/` has been migrated:

- ✅ `server/services/evaluationEngine.ts` → `apps/evaluation-service/src/app/evaluation/`
- ✅ `server/services/policyEngine.ts` → `apps/evaluation-service/src/app/policies/`
- ✅ `server/services/promptService.ts` → `apps/core-service/src/app/prompts/`
- ✅ `server/services/datasetService.ts` → `apps/core-service/src/app/datasets/`
- ✅ `server/services/templateEngine.ts` → `apps/core-service/src/app/templates/`
- ✅ `server/services/azureOpenAIAdapter.ts` → `apps/evaluation-service/src/app/ai-provider/` and `apps/integration-service/src/app/azure/`
- ✅ `server/services/azureMLService.ts` → `apps/integration-service/src/app/azure/`
- ✅ `server/services/azureDiscoveryService.ts` → `apps/integration-service/src/app/azure/`
- ✅ `server/services/promptFlowAdapter.ts` → `apps/evaluation-service/src/app/prompt-flow/`
- ✅ `server/services/microsoftAuth.ts` → `apps/auth-service/src/app/auth/microsoft/`
- ✅ `server/services/webhookService.ts` → `apps/integration-service/src/app/webhooks/`
- ✅ `server/storage.ts` → Service-specific `DatabaseStorageService` in each service
- ✅ `server/routes.ts` → NestJS controllers in respective services
- ✅ `server/replitAuth.ts` → Replaced with JWT authentication in `apps/auth-service/`

### Placeholder Services (Can be completed later)

These services have placeholder implementations but the structure is in place:

- `apps/integration-service/src/app/alerts/` - Alert management (placeholder)
- `apps/auth-service/src/app/permissions/` - Permission system (placeholder)

### Removal Steps

1. **Verify all services are working**: Test all endpoints through API Gateway
2. **Backup server directory** (optional): `cp -r server server.backup`
3. **Remove server directory**: `rm -rf server/`
4. **Update any remaining references**: Check for any imports or references to `server/`
5. **Remove Express.js dependencies** (if not used elsewhere):
   - `express`
   - `express-rate-limit`
   - `express-session`
   - `connect-pg-simple`

### Files to Keep for Reference (Optional)

If you want to keep some files for reference:

- `server/services/evaluationEngine.ts` - Reference for evaluator implementations
- `server/services/policyEngine.ts` - Reference for policy evaluation logic

These can be moved to a `docs/reference/` directory if needed.

