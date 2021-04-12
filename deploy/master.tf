# module composition: https://www.terraform.io/docs/modules/composition.html
module "env" {
  source = "./env"
}

# security.tf
# ALB Security Group: Edit this to restrict access to the application
resource "aws_security_group" "lb" {
  name        = "${module.env.name}-as-gateway-load-balancer-security-group"
  description = "controls access to the ALB"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  # port 80 must also be allowed even thought we redirect to 443
  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name  = "as-gateway-${module.env.name}-lb-security_group"
    stack = "Terraform"
  }
}

# Traffic to the ECS cluster should only come from the ALB
resource "aws_security_group" "ecs_tasks" {
  name        = "${module.env.name}-as-gateway-ecs-tasks-security-group"
  description = "allow inbound access from the ALB only"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    protocol        = "tcp"
    from_port       = module.env.app_port
    to_port         = module.env.app_port
    security_groups = [aws_security_group.lb.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name  = "${module.env.name}-ecs-security_group"
    stack = "Terraform"
  }
}

# alb.tf

resource "aws_alb" "main" {
  name            = "${module.env.name}-as-gateway-load-balancer"
  subnets         = data.aws_subnet_ids.public.ids
  security_groups = [aws_security_group.lb.id]
}

resource "aws_alb_target_group" "app" {
  name        = "${module.env.name}-as-gateway-target-group"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.main.id
  target_type = "ip"
  lifecycle {
    create_before_destroy = true
    ignore_changes        = [name]
  }

  health_check {
    healthy_threshold = "3"  # default
    interval          = "30" # default
    protocol          = "HTTP"
    matcher           = "200-299"
    # timeout           = "3" # leave as default
    path                = "/" # leave as default
    unhealthy_threshold = "3" # default
  }
}

# Redirect all traffic from the ALB to the target group
resource "aws_alb_listener" "front_end" {
  load_balancer_arn = aws_alb.main.id
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Secure HTTPS port with SSL
resource "aws_alb_listener" "secure" {
  load_balancer_arn = aws_alb.main.id
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.ssl.arn

  default_action {
    target_group_arn = aws_alb_target_group.app.id
    type             = "forward"
  }
}



resource "aws_ecs_task_definition" "app" {
  family                   = "${module.env.name}-as-gateway-task"
  execution_role_arn       = data.aws_iam_role.ecs_task_execution_role.arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = module.env.fargate_cpu
  memory                   = module.env.fargate_memory
  container_definitions    = data.template_file.as-gateway_app.rendered
  # task_role_arn            = "arn:aws:iam::366355310502:role/sqs-full"
}

resource "aws_ecs_service" "main" {
  name            = "${module.env.name}-as-gateway-service"
  cluster         = data.aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = module.env.app_count
  # launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 180

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    base              = 1
    weight            = 100
  }

  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = data.aws_subnet_ids.private.ids
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.app.id
    container_name   = "${module.env.name}-as-gateway"
    container_port   = module.env.app_port
  }

  depends_on = [aws_alb_listener.front_end]
}


# auto_scaling.tf

resource "aws_appautoscaling_target" "app" {
  service_namespace  = "ecs"
  resource_id        = "service/${module.env.ecs_cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = module.env.autoscale_min_capacity
  max_capacity       = module.env.autoscale_max_capacity
}

# Automatically scale capacity up by one
resource "aws_appautoscaling_policy" "up" {
  name               = "${module.env.name}-as-gateway_scale_up"
  service_namespace  = "ecs"
  resource_id        = "service/${module.env.ecs_cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }

  depends_on = [aws_appautoscaling_target.app]
}

# Automatically scale capacity down by one
resource "aws_appautoscaling_policy" "down" {
  name               = "${module.env.name}-as-gateway_scale_down"
  service_namespace  = "ecs"
  resource_id        = "service/${module.env.ecs_cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = -1
    }
  }

  depends_on = [aws_appautoscaling_target.app]
}

# Cloudwatch alarm that triggers the autoscaling up policy
resource "aws_cloudwatch_metric_alarm" "service_cpu_high" {
  alarm_name          = "${module.env.name}-as-gateway_cpu_utilization_high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "85"

  dimensions = {
    ClusterName = module.env.ecs_cluster_name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = [aws_appautoscaling_policy.up.arn]
}

# Cloudwatch alarm that triggers the autoscaling down policy
resource "aws_cloudwatch_metric_alarm" "service_cpu_low" {
  alarm_name          = "${module.env.name}-as-gateway_cpu_utilization_low"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "10"

  dimensions = {
    ClusterName = module.env.ecs_cluster_name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = [aws_appautoscaling_policy.down.arn]
}

# logs.tf

# Set up cloudwatch group and log stream and retain logs for 30 days
resource "aws_cloudwatch_log_group" "as-gateway_log_group" {
  name              = "/ecs/as-gateway/${module.env.name}"
  retention_in_days = 30

  tags = {
    Name = "as-gateway-log-group"
  }
}

resource "aws_cloudwatch_log_stream" "as-gateway_log_stream" {
  name           = "${module.env.name}-as-gateway-log-stream"
  log_group_name = aws_cloudwatch_log_group.as-gateway_log_group.name
}

# domain.tf

resource "aws_route53_record" "test_app_domain" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = "${module.env.name}.gateway.psiinformatics.com."
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "prod_domain" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = "gateway.psiinformatics.com."
  type    = "A"
  count   = module.env.name == "prod" ? 1 : 0

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = false
  }
}
