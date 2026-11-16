SHELL := /bin/bash
.DEFAULT_GOAL := help
CHAT_MODEL ?= qwen2.5:7b
EMBED_MODEL ?= bge-m3
TF_DIR := terraform/envs/local

.PHONY: help env models up down logs emulator-wait tf-init tf-apply tf-destroy docs ingest api web test lint hooks guard-check guard-check-api docs-serve

help: ## ターゲット一覧
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-14s %s\n", $$1, $$2}'

env: ## .env を生成（既にあれば何もしない）
	@if [ -f .env ]; then echo ".env already exists"; exit 0; fi; \
	pk="pk-lf-$$(openssl rand -hex 8)"; sk="sk-lf-$$(openssl rand -hex 16)"; \
	{ echo "LANGFUSE_PUBLIC_KEY=$$pk"; \
	  echo "LANGFUSE_SECRET_KEY=$$sk"; \
	  echo "LANGFUSE_AUTH=$$(printf '%s:%s' "$$pk" "$$sk" | base64 | tr -d '\n')"; \
	  echo "LANGFUSE_NEXTAUTH_SECRET=$$(openssl rand -hex 32)"; \
	  echo "LANGFUSE_SALT=$$(openssl rand -hex 16)"; \
	  echo "LANGFUSE_ENCRYPTION_KEY=$$(openssl rand -hex 32)"; \
	  echo "LANGFUSE_USER_PASSWORD=$$(openssl rand -hex 8)"; \
	  echo "EMULATOR_ARCH=$$( [ "$$(uname -m)" = arm64 ] && echo aarch64 || echo x86_64 )"; \
	} > .env; echo "wrote .env (Langfuse login: admin@example.com / see LANGFUSE_USER_PASSWORD)"

models: ## Ollama にモデルを取得
	ollama pull $(CHAT_MODEL)
	ollama pull $(EMBED_MODEL)

up: ## Docker Compose で基盤を起動
	docker compose up -d --build
	$(MAKE) emulator-wait

down: ## 停止（エミュレーターの状態は消える）
	docker compose down

logs: ## ログを追う
	docker compose logs -f --tail=100

emulator-wait:
	./scripts/wait-emulator.sh

tf-init:
	source scripts/emulator-env.sh && terraform -chdir=$(TF_DIR) init -input=false

tf-apply: tf-init ## Terraform でエミュレーターに構築
	source scripts/emulator-env.sh && terraform -chdir=$(TF_DIR) apply -auto-approve -input=false

tf-destroy:
	source scripts/emulator-env.sh && terraform -chdir=$(TF_DIR) destroy -auto-approve -input=false

docs: ## 題材ドキュメントを取得
	./scripts/fetch-docs.sh

ingest: ## ドキュメントを埋め込んで pgvector に入れる
	cd app/api && npm run ingest -- ../../data/docs

api: ## アプリAPIを起動（:8787）
	source scripts/emulator-env.sh && cd app/api && npm run dev

web: ## チャット画面を起動（:5173）
	cd app/web && npm run dev

guard-check: ## ガードレールのケース（eval/guard-cases.jsonl）を判定
	cd app/api && npm run guard:check

guard-check-api: ## 同じケースをアプリAPIに流してトレースを作る
	cd app/api && npm run guard:check -- --api http://127.0.0.1:8787/chat

hooks: ## コミット前・プッシュ前のフックを有効にする（lefthook）
	lefthook install

lint: ## リンター一式（Biome・shellcheck・actionlint・hadolint・tflint・gitleaks）
	npx biome check .
	shellcheck scripts/*.sh
	actionlint
	hadolint infra/aws-emulator/Dockerfile
	cd terraform && tflint --init --config "$(CURDIR)/.tflint.hcl" && tflint --recursive --config "$(CURDIR)/.tflint.hcl"
	gitleaks git --redact --no-banner .

test: ## 型チェックとテスト
	npm run typecheck && npm test

docs-serve: ## デザインドックをローカルで表示
	pip install -q -r docs/requirements.txt && mkdocs serve
