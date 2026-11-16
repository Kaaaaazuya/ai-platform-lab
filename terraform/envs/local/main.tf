# AWS Emulator 向けの環境（ADR-006）
#
# 接続先は provider には書かず、環境変数で切り替える（scripts/emulator-env.sh）:
#   AWS_ENDPOINT_URL / AWS_CONFIG_FILE / AWS_SHARED_CREDENTIALS_FILE / AWS_CA_BUNDLE
# 同じモジュールを実AWS向けの環境（envs/aws, M5で追加）からも使う。
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # エミュレーターは停止で状態が消えるので、state もローカルに置いて毎回捨てる
}

provider "aws" {
  region = "us-east-1"

  # エミュレーターには実在しないアカウント・メタデータのチェックを省く
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

module "chat_store" {
  source      = "../../modules/chat-store"
  name_prefix = "ai-platform-lab"
}

output "conversations_table" {
  value = module.chat_store.conversations_table
}

output "docs_bucket" {
  value = module.chat_store.docs_bucket
}
