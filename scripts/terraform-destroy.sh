#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$repo_root/logs"
LOG_FILE=${LOG_FILE:-"$repo_root/logs/terraform-destroy-$(date +%Y%m%d-%H%M%S).log"}
exec > >(tee -a "$LOG_FILE") 2>&1

echo "Terraform destroy log: $LOG_FILE"

if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform is required to destroy the Vault deployment."
  echo "Install it from https://www.terraform.io/downloads"
  exit 1
fi

cd "$repo_root/terraform"

KUBECONFIG_PATH=${KUBECONFIG:-~/.kube/config}

echo "Initializing Terraform..."
terraform init -input=false

echo "Destroying Vault infrastructure..."
terraform destroy -auto-approve -input=false \
  -var-file=terraform.tfvars.json \
  -var="kubeconfig_path=$KUBECONFIG_PATH"

echo "Vault infrastructure destroyed."
