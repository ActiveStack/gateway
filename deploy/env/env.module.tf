variable "env_map" {
    type = map
    default = {
        prod = {
            name                     = "prod"
            aws_region               = "us-west-2"
            az_count                 = 2
            app_count                = 1
            fargate_cpu              = "256" # (2 vCPU)
            fargate_memory           = "512"
            autoscale_min_capacity   = 1
            autoscale_max_capacity   = 3
            app_port                 = 8080

            log_level                = "info"
            rabbit_host              = ""
            redis_host               = ""
            
            # Existing resources that we need references to
            ecs_cluster_id           = ""
            vpc_id                   = ""

            # Resources from old deployment arch
            old_vpc_id               = "vpc-47f20f23" 
            db_security_group_id     = "sg-eacf5a8d" 
        }
        dev = {
            name                     = "dev"
            aws_region               = "us-west-2"
            az_count                 = 2
            app_count                = 1
            fargate_cpu              = "256" # (2 vCPU)
            fargate_memory           = "512"
            autoscale_min_capacity   = 1
            autoscale_max_capacity   = 3
            app_port                 = 8080

            log_level                = "info"
            rabbit_host              = "ip-10-0-1-43.us-west-2.compute.internal"
            redis_host               = "dev-a.pg6ieh.0001.usw2.cache.amazonaws.com"
            
            # Existing resources that we need references to
            ecs_cluster_name         = "dev-hometree-cluster"
            vpc_id                   = "vpc-057c4181500c9eb99"

            # Resources from old deployment arch
            old_vpc_id               = "vpc-47f20f23" 
            db_security_group_id     = "sg-eacf5a8d" 
        }
    }
}

locals {
    env = var.env_map[terraform.workspace]
}

output name {
    value = local.env["name"]
}
output aws_region {
    value = local.env["aws_region"]
}
output az_count {
    value = local.env["az_count"]
}

output app_count {
    value = local.env["app_count"]
}

output fargate_cpu {
    value = local.env["fargate_cpu"]
}

output fargate_memory {
    value = local.env["fargate_memory"]
}

output autoscale_min_capacity {
    value = local.env["autoscale_min_capacity"]
}

output autoscale_max_capacity {
    value = local.env["autoscale_max_capacity"]
}
              
output ecs_cluster_name {
  value = local.env["ecs_cluster_name"]
}   

output vpc_id {
  value = local.env["vpc_id"]
} 

output app_port {
  value = local.env["app_port"]
} 

output log_level {
  value = local.env["log_level"]
}
output rabbit_host {
  value = local.env["rabbit_host"]
}
output redis_host {
  value = local.env["redis_host"]
}
output old_vpc_id {
  value = local.env["old_vpc_id"]
}
output db_security_group_id {
  value = local.env["db_security_group_id"]
}
