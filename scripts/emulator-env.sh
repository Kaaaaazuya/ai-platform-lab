#!/usr/bin/env bash
# AWS Emulator に向けるための環境変数（AWS公式ドキュメントの手順どおり）。
# 使い方: source scripts/emulator-env.sh
# エミュレーターは起動のたびに認証情報とCA証明書を ~/.aws/emulator/<port>/ に書き出す。
EMULATOR_PORT="${EMULATOR_PORT:-9297}"
EMULATOR_DIR="$HOME/.aws/emulator/$EMULATOR_PORT"

export AWS_ENDPOINT_URL="https://127.0.0.1:${EMULATOR_PORT}"
export AWS_SHARED_CREDENTIALS_FILE="$EMULATOR_DIR/emulator_credentials"
export AWS_CONFIG_FILE="$EMULATOR_DIR/config"
export AWS_CA_BUNDLE="$EMULATOR_DIR/ca.pem"
# Node.js（AWS SDK v3）にエミュレーターのCAを信頼させる
export NODE_EXTRA_CA_CERTS="$EMULATOR_DIR/ca.pem"
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE
