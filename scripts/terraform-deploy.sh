#!/usr/bin/env bash
set -euo pipefail

if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform is required to deploy Vault via Terraform."
  echo "Install it from https://www.terraform.io/downloads"
  exit 1
fi

cd "$(dirname "$0")/.."

KUBECONFIG_PATH=${KUBECONFIG:-~/.kube/config}

echo "Initializing Terraform..."
cd terraform
terraform init

echo "Applying Terraform configuration..."
terraform apply -auto-approve -var="kubeconfig_path=$KUBECONFIG_PATH"

NODE_PORT=$(terraform output -raw vault_service_node_port)

if command -v minikube >/dev/null 2>&1; then
  MINIKUBE_IP=$(minikube ip)
  echo "Vault should be available at: http://$MINIKUBE_IP:$NODE_PORT"
  echo "You can also use: minikube service vault --url"
else
  echo "Vault NodePort is $NODE_PORT. Use your node IP to connect."
fi
