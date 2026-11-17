output "tfstate_bucket" {
  description = "envs/aws の backend に書くバケット名"
  value       = aws_s3_bucket.tfstate.bucket
}

output "plan_role_arn" {
  description = "Environment aws-plan の変数 AWS_ROLE_ARN に入れる"
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Environment aws-apply の変数 AWS_ROLE_ARN に入れる"
  value       = aws_iam_role.apply.arn
}
