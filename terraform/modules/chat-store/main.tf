# チャットの保存先: 会話履歴（DynamoDB）と RAG の原文書（S3）
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "name_prefix" {
  type        = string
  description = "リソース名の接頭辞"
}

resource "aws_dynamodb_table" "conversations" {
  name         = "${var.name_prefix}-conversations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"
  range_key    = "ts"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "ts"
    type = "S"
  }
}

resource "aws_s3_bucket" "docs" {
  bucket        = "${var.name_prefix}-docs"
  force_destroy = true
}

# 原文書は外に公開しない。ACL とバケットポリシーによる公開をすべて止める（Trivy AWS-0086/0087/0091/0093）
resource "aws_s3_bucket_public_access_block" "docs" {
  bucket = aws_s3_bucket.docs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "conversations_table" {
  value = aws_dynamodb_table.conversations.name
}

output "docs_bucket" {
  value = aws_s3_bucket.docs.bucket
}
