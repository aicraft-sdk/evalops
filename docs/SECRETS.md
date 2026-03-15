# Secrets Management

## Rule: No secrets in ConfigMaps or source code

All sensitive values must be stored in Kubernetes Secrets or Azure Key Vault.
Never commit secrets to version control. The `.env` file is listed in `.gitignore`.

---

## Required Secrets

| Key | Description | Required |
|-----|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | ≥32-char random string for JWT signing | Yes |
| `SERVICE_SECRET` | Shared token for service-to-service auth | Yes |
| `REDIS_PASSWORD` | Redis AUTH password | Yes |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string | Yes (for artifacts) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Azure Storage account name | Yes (for artifacts) |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container name | Yes (for artifacts) |
| `AZURE_STORAGE_ACCOUNT_KEY` | Storage account key (for SAS generation) | Yes (for presigned URLs) |
| `OPENAI_API_KEY` | OpenAI provider key | Optional |
| `ANTHROPIC_API_KEY` | Anthropic provider key | Optional |

---

## Local Development

Copy the example file and fill in values:

```bash
cp .env.example .env
# Edit .env with your local credentials
```

Never commit `.env` — it is gitignored.

---

## Kubernetes Deployment

Create the Kubernetes Secret from your environment:

```bash
kubectl create secret generic evalops-secrets \
  --namespace evalops \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=SERVICE_SECRET="$SERVICE_SECRET" \
  --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
  --from-literal=AZURE_STORAGE_CONNECTION_STRING="$AZURE_STORAGE_CONNECTION_STRING" \
  --from-literal=AZURE_STORAGE_ACCOUNT_NAME="$AZURE_STORAGE_ACCOUNT_NAME" \
  --from-literal=AZURE_STORAGE_CONTAINER_NAME="$AZURE_STORAGE_CONTAINER_NAME" \
  --from-literal=AZURE_STORAGE_ACCOUNT_KEY="$AZURE_STORAGE_ACCOUNT_KEY"
```

---

## Azure Key Vault Integration

For production, load secrets from Azure Key Vault at startup using
the `AZURE_KEY_VAULT_URL` env var:

```bash
AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/
```

The services will attempt to load secrets from Key Vault using
Managed Identity (DefaultAzureCredential) when `AZURE_KEY_VAULT_URL` is set.

### External Secrets Operator (recommended)

Use [external-secrets.io](https://external-secrets.io/) to sync Azure Key Vault
secrets into Kubernetes Secrets automatically:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: evalops-secrets
  namespace: evalops
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-key-vault
    kind: ClusterSecretStore
  target:
    name: evalops-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: evalops-jwt-secret
    - secretKey: DATABASE_URL
      remoteRef:
        key: evalops-database-url
    # ... add remaining secrets
```

---

## Generating Secrets

```bash
# JWT_SECRET (32+ chars)
openssl rand -hex 32

# SERVICE_SECRET
openssl rand -hex 24
```
