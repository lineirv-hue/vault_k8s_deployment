output "vault_service_node_port" {
  description = "NodePort where Vault is available on the Minikube node."
  value       = kubernetes_service.vault.spec[0].port[0].node_port
}

output "vault_service_name" {
  description = "Kubernetes service name for Vault."
  value       = kubernetes_service.vault.metadata[0].name
}
