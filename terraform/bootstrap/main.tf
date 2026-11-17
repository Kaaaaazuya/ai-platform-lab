# 実AWS検証用アカウントの常設リソース（ADR-007）
#
# 手元から一度だけ apply する。中身は次の4つ:
#   - Terraform の state を置く S3 バケット
#   - GitHub Actions の OIDC プロバイダーと、plan 用・apply 用のロール
#   - 月5ドルの予算と、50%・80%・100% のメール通知
#   - 100% で、両ロールに Bedrock を拒否するポリシーを付ける予算アクション
#
# この構成自体の state はローカルに置く（.gitignore 済み）。
# 手順は docs/setup-aws.md を見る。
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "ai-platform-lab"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
      # 期限タグを探すワークフローが、常設のものとして読み飛ばす
      Lifetime = "permanent"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  prefix     = "ai-platform-lab"
  # GitHub の Environment を使うジョブの sub は repo:<owner>/<repo>:environment:<名前> になる。
  # main だけに絞るのは、Environment の「デプロイできるブランチ」の設定で行う。
  sub_plan  = "repo:${var.github_repository}:environment:${var.plan_environment}"
  sub_apply = "repo:${var.github_repository}:environment:${var.apply_environment}"
}

# ---------------------------------------------------------------------------
# state バケット
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "tfstate" {
  bucket = "${local.prefix}-tfstate-${local.account_id}"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# 古い版は90日で消す（state の履歴を残しつつ、溜めすぎない）
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

data "aws_iam_policy_document" "tfstate_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.tfstate.arn,
      "${aws_s3_bucket.tfstate.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = data.aws_iam_policy_document.tfstate_tls_only.json
  # 公開アクセスのブロックを先に作り、ポリシーが公開と誤判定されないようにする
  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

# ---------------------------------------------------------------------------
# GitHub Actions の OIDC
# ---------------------------------------------------------------------------

# thumbprint は AWS が GitHub の証明書を自前で検証するので書かない
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "trust_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.sub_plan]
    }
  }
}

data "aws_iam_policy_document" "trust_apply" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.sub_apply]
    }
  }
}

# plan と、毎日の残りの確認に使う。読むだけ（state のロックファイルだけ書ける）
resource "aws_iam_role" "plan" {
  name                 = "${local.prefix}-gha-plan"
  assume_role_policy   = data.aws_iam_policy_document.trust_plan.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

# apply・スモークテスト・destroy に使う。承認つきの Environment からだけ入れる
resource "aws_iam_role" "apply" {
  name                 = "${local.prefix}-gha-apply"
  assume_role_policy   = data.aws_iam_policy_document.trust_apply.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "state_access" {
  statement {
    sid       = "ListStateBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }
  # S3 のネイティブロック（use_lockfile）は <key>.tflock を書いて消す
  statement {
    sid       = "WriteLockFile"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*.tflock"]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "tfstate"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_access.json
}

data "aws_iam_policy_document" "apply" {
  statement {
    sid       = "ListStateBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
  statement {
    sid       = "ReadWriteState"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }

  # Guardrails を作って消す。東京に限る
  statement {
    sid = "ManageGuardrails"
    actions = [
      "bedrock:CreateGuardrail",
      "bedrock:CreateGuardrailVersion",
      "bedrock:UpdateGuardrail",
      "bedrock:DeleteGuardrail",
      "bedrock:GetGuardrail",
      "bedrock:ListGuardrails",
      "bedrock:TagResource",
      "bedrock:UntagResource",
      "bedrock:ListTagsForResource",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  # スモークテスト。モデルの呼び出しと、Guardrails 単体の検査
  statement {
    sid = "InvokeForSmokeTest"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
      "bedrock:ApplyGuardrail",
      "bedrock:GetFoundationModel",
      "bedrock:ListFoundationModels",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  # 期限タグを探す
  statement {
    sid       = "FindTaggedResources"
    actions   = ["tag:GetResources"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "apply" {
  name   = "verify"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply.json
}

# ---------------------------------------------------------------------------
# 予算と、上限を超えたときに Bedrock を止めるアクション
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "deny_bedrock" {
  statement {
    sid    = "DenyBedrockOverBudget"
    effect = "Deny"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
      "bedrock:ApplyGuardrail",
      "bedrock:CreateGuardrail",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "deny_bedrock" {
  name        = "${local.prefix}-deny-bedrock"
  description = "Attached by AWS Budgets when the monthly budget is exceeded (ADR-007)"
  policy      = data.aws_iam_policy_document.deny_bedrock.json
}

data "aws_iam_policy_document" "trust_budgets" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "budgets_action" {
  name               = "${local.prefix}-budgets-action"
  assume_role_policy = data.aws_iam_policy_document.trust_budgets.json
}

# 予算アクションがポリシーを付け外しするための最小限の権限
data "aws_iam_policy_document" "budgets_action" {
  statement {
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [aws_iam_role.plan.arn, aws_iam_role.apply.arn]
    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = [aws_iam_policy.deny_bedrock.arn]
    }
  }
}

resource "aws_iam_role_policy" "budgets_action" {
  name   = "attach-deny-bedrock"
  role   = aws_iam_role.budgets_action.id
  policy = data.aws_iam_policy_document.budgets_action.json
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}

resource "aws_budgets_budget_action" "deny_bedrock" {
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budgets_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_bedrock.arn
      roles      = [aws_iam_role.plan.name, aws_iam_role.apply.name]
    }
  }

  subscriber {
    address           = var.alert_email
    subscription_type = "EMAIL"
  }

  depends_on = [aws_iam_role_policy.budgets_action]
}
