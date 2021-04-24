[
  {
    "name": "${workspace_env}-as-gateway",
    "image": "${app_image}",
    "cpu": ${fargate_cpu},
    "memory": ${fargate_memory},
    "networkMode": "awsvpc",
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/as-gateway/${workspace_env}",
        "awslogs-region": "${aws_region}",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "portMappings": [
      {
        "containerPort": ${app_port},
        "hostPort": ${app_port}
      }
    ],
    "secrets": [
      {
        "name": "RABBIT_USER",
        "valueFrom": "arn:aws:secretsmanager:${aws_region}:${aws_account_id}:secret:${workspace_env}:RABBIT_USER::"
      },
      {
        "name": "RABBIT_PASS",
        "valueFrom": "arn:aws:secretsmanager:${aws_region}:${aws_account_id}:secret:${workspace_env}:RABBIT_PASS::"
      },
      {
        "name": "REDIS_PASS",
        "valueFrom": "arn:aws:secretsmanager:${aws_region}:${aws_account_id}:secret:${workspace_env}:REDIS_PASS::"
      }
    ],
    "environment": [
      {
        "name": "APP_PORT",
        "value": "${app_port}"  
      },
      { 
        "name": "LOG_LEVEL",
        "value": "${log_level}"
      },
      { 
        "name": "RABBIT_HOST",
        "value": "${rabbit_host}"
      },
      { 
        "name": "RABBIT_PORT",
        "value": "${rabbit_port}"
      },
      { 
        "name": "RABBIT_USE_SSL",
        "value": "true"
      },
      { 
        "name": "REDIS_HOST",
        "value": "${redis_host}"
      },
      { 
        "name": "WORKER_COUNT",
        "value": "${worker_count}"
      }
    ]
  }
]