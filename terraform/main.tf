provider "kubernetes" {
  config_path = pathexpand(var.kubeconfig_path)
}

resource "kubernetes_config_map" "vault_config" {
  metadata {
    name      = "vault-config"
    namespace = var.namespace
  }

  data = {
    "vault.hcl" = <<-EOT
      ui = ${var.vault_ui_enabled}

      listener "tcp" {
        address     = "${var.vault_listener_address}"
        port        = ${var.vault_listener_port}
        tls_disable = ${var.vault_tls_disable}
      }

      storage "file" {
        path = "${var.vault_storage_path}"
      }

      disable_mlock = ${var.vault_disable_mlock}
      log_level = "${var.vault_log_level}"
      EOT
  }
}

resource "kubernetes_persistent_volume" "vault_data" {
  metadata {
    name = "vault-data-pv"
  }

  spec {
    capacity = {
      storage = "1Gi"
    }
    access_modes                   = ["ReadWriteOnce"]
    persistent_volume_reclaim_policy = "Retain"
    storage_class_name             = "manual"

    host_path {
      path = var.pv_host_path
    }
  }
}

resource "kubernetes_persistent_volume_claim" "vault_data" {
  metadata {
    name      = "vault-data-pvc"
    namespace = var.namespace
  }

  spec {
    access_modes      = ["ReadWriteOnce"]
    storage_class_name = "manual"

    resources {
      requests = {
        storage = "1Gi"
      }
    }
  }
}

resource "kubernetes_deployment" "vault" {
  metadata {
    name      = "vault"
    namespace = var.namespace
    labels = {
      app = "vault"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "vault"
      }
    }

    template {
      metadata {
        labels = {
          app = "vault"
        }
      }

      spec {
        container {
          name  = "vault"
          image = var.vault_image

          args = [
            "server",
            "-config=/vault/config/vault.hcl",
          ]

          port {
            container_port = 8200
            name           = "vault"
          }

          volume_mount {
            name       = "vault-config"
            mount_path = "/vault/config"
          }

          volume_mount {
            name       = "vault-data"
            mount_path = "/vault/data"
          }
        }

        volume {
          name = "vault-config"

          config_map {
            name = kubernetes_config_map.vault_config.metadata[0].name
          }
        }

        volume {
          name = "vault-data"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.vault_data.metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "vault" {
  metadata {
    name      = "vault"
    namespace = var.namespace
    labels = {
      app = "vault"
    }
  }

  spec {
    selector = {
      app = kubernetes_deployment.vault.metadata[0].labels.app
    }

    type = "NodePort"

    port {
      name        = "http"
      port        = 8200
      target_port = 8200
      node_port   = var.node_port
    }
  }
}
