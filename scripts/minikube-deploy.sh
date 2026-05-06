#!/usr/bin/env bash
set -euo pipefail

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required to deploy Vault to minikube."
  exit 1
fi

echo "Applying Vault manifests to minikube..."
kubectl apply -f k8s/vault-configmap.yaml
kubectl apply -f k8s/vault-pv-pvc.yaml
kubectl apply -f k8s/vault-deployment.yaml
kubectl apply -f k8s/vault-service.yaml

echo "Waiting for Vault pod to become ready..."
kubectl wait --for=condition=ready pod -l app=vault --timeout=120s

echo "Vault deployed to minikube."
if command -v minikube >/dev/null 2>&1; then
  echo "Access Vault at: $(minikube ip):32000"
  echo "Or use: minikube service vault --url"
else
  echo "Vault service is exposed on NodePort 32000."
fi
