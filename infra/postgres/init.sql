-- RAG 用のデータベースを Langfuse 用（postgres）とは分けて作る
CREATE DATABASE rag;
\connect rag
CREATE EXTENSION IF NOT EXISTS vector;
