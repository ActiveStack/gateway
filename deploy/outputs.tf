output "alb_hostname" {
  value = aws_alb.main.dns_name
}

output "name" {
  value = module.env.name
}
output "aws_region" {
  value       = module.env.aws_region
  description = "The AWS region things are created in"
}
output "az_count" {
  value       = module.env.az_count
  description = "Number of AZs to cover in a given region"
}

output "app_image" {
  value       = var.app_image
  description = "Docker image to run in the ECS cluster"
}

output "app_count" {
  value       = module.env.app_count
  description = "Number of docker containers to run"
}

output "ecs_autoscale_role" {
  value       = data.aws_iam_role.ecs_autoscale_role.arn
  description = "Role arn for the ecsAutocaleRole (maybe not used)"
}

output "ecs_task_execution_role" {
  value       = data.aws_iam_role.ecs_task_execution_role.arn
  description = "Role arn for the ecsTaskExecutionRole"
}

output "fargate_cpu" {
  value       = module.env.fargate_cpu
  description = "Fargate instance CPU units to provision (1 vCPU = 1024 CPU units)"
}

output "fargate_memory" {
  value       = module.env.fargate_memory
  description = "Fargate instance memory to provision (in MiB)"
}

output "workspace_env" {
  value       = module.env.name
  description = "Terraform workspace environment"
}
