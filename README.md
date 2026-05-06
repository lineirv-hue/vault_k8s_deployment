# vault_k8s_deployment

Kubernetes deployment examples for HashiCorp Vault.

## Files
- `.gitignore` — ignores local artifacts and secrets
- `terraform/` — Terraform configuration for Vault resources on Minikube
- `k8s/vault-configmap.yaml` — Vault configuration stored in a ConfigMap (legacy kubectl manifests)
- `k8s/vault-deployment.yaml` — Vault deployment manifest (legacy kubectl manifests)
- `k8s/vault-service.yaml` — Vault service manifest (legacy kubectl manifests)
- `k8s/vault-pv-pvc.yaml` — PersistentVolume and PersistentVolumeClaim for Minikube
- `scripts/terraform-deploy.sh` — deploy Vault using Terraform
- `scripts/terraform-destroy.sh` — destroy Vault resources with Terraform
- `scripts/minikube-deploy.sh` — legacy kubectl-based deployment
- `scripts/vault-init.sh` — initialize and configure Vault engines

## Terraform deployment
Use Terraform for the Vault deployment on Minikube:
```bash
./scripts/terraform-deploy.sh
```

Terraform reads default values from `terraform/terraform.tfvars.json`. Edit that file to customize values such as `kubeconfig_path`, `namespace`, `vault_image`, `node_port`, `pv_host_path`, and Vault-specific configuration like `vault_ui_enabled`, `vault_tls_disable`, `vault_log_level`, `vault_log_dir`, `vault_log_file`, and logrotate settings.

To destroy the deployment:
```bash
./scripts/terraform-destroy.sh
```

The Terraform configuration uses the Kubernetes provider and the Minikube kubeconfig. It deploys:
- ConfigMap for `vault.hcl`
- hostPath-backed PersistentVolume and PersistentVolumeClaim
- Vault Deployment
- NodePort Service on `32000`

## Initialization and engine configuration
After Terraform deploy, initialize Vault and enable the engines configured via `VAULT_ENGINES`:
```bash
cd /Users/irvingfarinas/vault_k8s_deployment
./scripts/vault-init.sh
```

## Initialization and engine configuration
After deployment, initialize Vault and enable the engines configured via `VAULT_ENGINES`:
```bash
cd /Users/irvingfarinas/vault_k8s_deployment
./scripts/vault-init.sh
```

The script defaults to enabling:
- `kv` at `vault`
- `transit` at `transit`

The generated Vault root token and recovery key are saved in KV at `vault/root`.

To customize engines, set `VAULT_ENGINES` as a comma-separated list of `type:path` mounts. Example:
```bash
VAULT_ENGINES="kv:vault,transit:transit" ./scripts/vault-init.sh
```

## Notes
- This example uses Vault with local file storage and a hostPath-backed PersistentVolume for Minikube.
- For production, replace the storage backend, enable TLS, and harden Vault initialization.
