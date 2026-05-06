# vault_k8s_deployment

Kubernetes deployment examples for HashiCorp Vault.

## Files
- `.gitignore` — ignores local artifacts and secrets
- `k8s/vault-configmap.yaml` — Vault configuration stored in a ConfigMap
- `k8s/vault-deployment.yaml` — Vault deployment manifest
- `k8s/vault-service.yaml` — ClusterIP service for Vault

## Apply
```bash
kubectl apply -f k8s/vault-configmap.yaml
kubectl apply -f k8s/vault-deployment.yaml
kubectl apply -f k8s/vault-service.yaml
```

## Notes
- This example uses Vault with local file storage for a Kubernetes test/dev setup.
- For production, replace the storage backend and enable TLS.
