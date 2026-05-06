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
kubectl apply -f k8s/vault-pv-pvc.yaml
kubectl apply -f k8s/vault-deployment.yaml
kubectl apply -f k8s/vault-service.yaml
```

## Minikube deployment
For local Minikube, use the included script:
```bash
./scripts/minikube-deploy.sh
```
By default, Vault is exposed on NodePort `32000`. If Minikube is installed, access it at `$(minikube ip):32000`.

## Initialization and engine configuration
After deployment, initialize Vault and enable the engines configured via `VAULT_ENGINES`:
```bash
cd /Users/irvingfarinas/vault_k8s_deployment
./scripts/vault-init.sh
```

The script defaults to enabling:
- `kv` at `secret`
- `transit` at `transit`

To customize engines, set `VAULT_ENGINES` as a comma-separated list of `type:path` mounts. Example:
```bash
VAULT_ENGINES="kv:secret,transit:transit" ./scripts/vault-init.sh
```

## Notes
- This example uses Vault with local file storage and a hostPath-backed PersistentVolume for Minikube.
- For production, replace the storage backend, enable TLS, and harden Vault initialization.
