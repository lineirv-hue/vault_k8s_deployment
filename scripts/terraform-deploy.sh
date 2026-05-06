#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$repo_root/logs"
LOG_FILE=${LOG_FILE:-"$repo_root/logs/terraform-deploy-$(date +%Y%m%d-%H%M%S).log"}
exec > >(tee -a "$LOG_FILE") 2>&1

echo "Terraform deployment log: $LOG_FILE"

if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform is required to deploy Vault via Terraform."
  echo "Install it from https://www.terraform.io/downloads"
  exit 1
fi

cd "$repo_root"

KUBECONFIG_PATH=${KUBECONFIG:-~/.kube/config}

echo "Initializing Terraform..."
cd terraform
terraform init -input=false

echo "Applying Terraform configuration..."
terraform apply -auto-approve -input=false \
  -var-file=terraform.tfvars.json \
  -var="kubeconfig_path=$KUBECONFIG_PATH"

NODE_PORT=$(terraform output -raw vault_service_node_port)

if command -v minikube >/dev/null 2>&1; then
  MINIKUBE_IP=$(minikube ip)
  echo "Vault is available at: http://$MINIKUBE_IP:$NODE_PORT"
  echo "Or use: minikube service vault --url"
else
  echo "Vault NodePort is $NODE_PORT. Use your node IP to connect."
fi

echo ""
echo "Initializing Vault..."
cd "$repo_root"
export VAULT_ADDR=${VAULT_ADDR:-"http://$(minikube ip 2>/dev/null || echo '127.0.0.1'):$NODE_PORT"}
bash scripts/vault-init.sh
