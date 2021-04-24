# Data Sources
# allows a Terraform configuration to make use of information defined outside of Terraform,
# or defined by another separate Terraform configuration.

data "template_file" "as-gateway_app" {
  template = file("./templates/app.taskdef.json.tpl")
  vars = {
    workspace_env  = module.env.name
    app_image      = var.app_image
    app_port       = module.env.app_port
    fargate_cpu    = module.env.fargate_cpu
    fargate_memory = module.env.fargate_memory
    aws_region     = module.env.aws_region
    log_level      = module.env.log_level
    rabbit_host    = regex("amqps://(.*):.*", data.aws_mq_broker.main.instances.0.endpoints.0)[0]
    rabbit_port    = regex("amqps://.*:(.*)", data.aws_mq_broker.main.instances.0.endpoints.0)[0]
    redis_host     = module.env.redis_host
    aws_account_id = var.aws_account_id
    worker_count   = module.env.worker_count
  }
}

# assume role
data "aws_iam_policy_document" "instance-assume-role-policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Use existing Autoscaling & Execution roles
data "aws_iam_role" "ecs_autoscale_role" {
  name = "ECSAutoScaling"
}

data "aws_iam_role" "ecs_task_execution_role" {
  name = "ECSTaskExecution"
}

# get existing zone (many existing records already)
data "aws_route53_zone" "selected" {
  name = "gateway.psiinformatics.com."
}

# AWS SSL Cert
data "aws_acm_certificate" "ssl" {
  domain      = "*.gateway.psiinformatics.com"
  types       = ["AMAZON_ISSUED"]
  most_recent = true
}

# Existing VPC to join
data "aws_vpc" "existing" {
  id = module.env.vpc_id
}

# ecs.tf

data "aws_ecs_cluster" "main" {
  cluster_name = module.env.ecs_cluster_name
}

data "aws_vpc" "main" {
  id = module.env.vpc_id
}

data "aws_subnet_ids" "private" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    tier = "private"
  }
}

data "aws_subnet_ids" "public" {
  vpc_id = data.aws_vpc.main.id

  tags = {
    tier = "public"
  }
}

data "aws_security_group" "accepter_rds" {
  vpc_id = module.env.old_vpc_id
  id     = module.env.db_security_group_id
}

data "aws_mq_broker" "main" {
  broker_name = "rabbitmq-${module.env.name}"
}
