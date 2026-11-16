# チャットの保存先: 会話履歴（DynamoDB）と RAG の原文書（S3）
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

output "conversations_table" {
  value = aws_dynamodb_table.conversations.name
}

output "docs_bucket" {
  value = aws_s3_bucket.docs.bucket
}
