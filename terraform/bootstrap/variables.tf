variable "region" {
  description = "検証に使うリージョン（ADR-007）"
  type        = string
  default     = "ap-northeast-1"
}

variable "github_repository" {
  description = "OIDC で信頼するリポジトリ（owner/name）"
  type        = string
  default     = "Kaaaaazuya/ai-platform-lab"
}

variable "plan_environment" {
  description = "plan と毎日の確認に使う GitHub の Environment"
  type        = string
  default     = "aws-plan"
}

variable "apply_environment" {
  description = "承認つきで apply に使う GitHub の Environment"
  type        = string
  default     = "aws-apply"
}

variable "monthly_budget_usd" {
  description = "月の上限額（USD）"
  type        = string
  default     = "5"
}

variable "alert_email" {
  description = "予算の通知先。terraform.tfvars に書き、コミットしない"
  type        = string
  sensitive   = true
}
