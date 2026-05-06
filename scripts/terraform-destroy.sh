#!/usr/bin/env bash
set -euo pipefail

if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform is required to destroy the Vault deployment."
  exit 1
fi

cd "$(dirname "$0")/.."

KUBECONFIG_PATH=${KUBECONFIG:-~/.kube/config}

cd terraform
terraform init
terraform destroy -auto-approve -var="kubeconfig_path=$KUBECONFIG_PATH"
