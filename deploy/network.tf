resource "aws_security_group_rule" "ecs_service_sg_rabbit" {
  type                     = "ingress"
  from_port                = 5672
  to_port                  = 5672
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  security_group_id        = data.aws_security_group.accepter_rds.id
  description              = "ECS Gateway Service SG rule for rabbit"
}

resource "aws_security_group_rule" "ecs_service_sg_redis" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  security_group_id        = data.aws_security_group.accepter_rds.id
  description              = "ECS Gateway Service SG rule for redis"
}