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

variable "vault_ui_enabled" {
  type        = bool
  description = "Whether Vault UI should be enabled."
  default     = true
}

variable "vault_listener_address" {
  type        = string
  description = "Vault listener address."
  default     = "0.0.0.0"
}

variable "vault_listener_port" {
  type        = number
  description = "Vault listener port."
  default     = 8200
}

variable "vault_tls_disable" {
  type        = bool
  description = "Disable TLS for Vault listener."
  default     = true
}

variable "vault_storage_path" {
  type        = string
  description = "Path to persist Vault data inside the container."
  default     = "/vault/data"
}

variable "vault_disable_mlock" {
  type        = bool
  description = "Disable mlock for Vault process."
  default     = true
}

variable "vault_log_level" {
  type        = string
  description = "Vault log level."
  default     = "info"
}
