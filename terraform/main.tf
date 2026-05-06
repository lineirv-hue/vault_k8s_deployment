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
        address     = "${var.vault_listener_address}:${var.vault_listener_port}"
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

resource "kubernetes_config_map" "vault_logrotate" {
  metadata {
    name      = "vault-logrotate"
    namespace = var.namespace
  }

  data = {
    "vault" = <<-EOT
      ${var.vault_log_dir}/${var.vault_log_file} {
        size ${var.vault_rotate_size}
        ${var.vault_rotate_copytruncate ? "copytruncate" : ""}
        rotate ${var.vault_rotate_rotate}
        ${var.vault_rotate_compress ? "compress" : ""}
        missingok
        notifempty
      }
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
    access_modes                     = ["ReadWriteOnce"]
    persistent_volume_reclaim_policy = "Retain"
    storage_class_name               = "manual"

    persistent_volume_source {
      host_path {
        path = var.pv_host_path
      }
    }
  }
}

resource "kubernetes_persistent_volume_claim" "vault_data" {
  metadata {
    name      = "vault-data-pvc"
    namespace = var.namespace
  }

  spec {
    access_modes       = ["ReadWriteOnce"]
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

  wait_for_rollout = false

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
          name    = "vault"
          image   = var.vault_image
          command = ["/bin/sh", "-c"]
          args = [
            "vault server -config=/vault/config/vault.hcl 2>&1 | tee ${var.vault_log_dir}/${var.vault_log_file}",
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

          volume_mount {
            name       = "vault-logs"
            mount_path = var.vault_log_dir
          }
        }

        container {
          name    = "vault-logrotate"
          image   = "alpine:3.18"
          command = ["/bin/sh", "-c"]
          args = [
            "apk add --no-cache logrotate >/dev/null 2>&1; while true; do logrotate /etc/logrotate.d/vault 2>/dev/null || true; sleep 60; done",
          ]

          volume_mount {
            name       = "vault-logs"
            mount_path = var.vault_log_dir
          }

          volume_mount {
            name       = "vault-logrotate-conf"
            mount_path = "/etc/logrotate.d"
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

        volume {
          name = "vault-logs"
          empty_dir {}
        }

        volume {
          name = "vault-logrotate-conf"

          config_map {
            name = kubernetes_config_map.vault_logrotate.metadata[0].name
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
