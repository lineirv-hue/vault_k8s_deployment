variable "kubeconfig_path" {
  type        = string
  description = "Path to the Kubernetes config file for Minikube."
  default     = "~/.kube/config"
}

variable "namespace" {
  type        = string
  description = "Kubernetes namespace where Vault should be deployed."
  default     = "default"
}

variable "vault_image" {
  type        = string
  description = "Docker image for Vault."
  default     = "hashicorp/vault:1.15.2"
}

variable "node_port" {
  type        = number
  description = "NodePort for Vault service exposure in Minikube."
  default     = 32000
}

variable "pv_host_path" {
  type        = string
  description = "Host path used for the Vault PersistentVolume in Minikube."
  default     = "/tmp/vault-data"
}
