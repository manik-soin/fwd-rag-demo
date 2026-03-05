# FWD Policy Assistant

Agentic RAG system for insurance policy Q&A with MCP integration, tenant isolation, and AI safety guardrails.

## Quick Start

```bash
cp .env.example .env  # Add your OPENAI_API_KEY
docker compose up -d  # Start PostgreSQL + pgvector
npm install
npm run seed          # Ingest documents + seed data
npm run dev           # Start server on :3000
```

## Tech Stack

Node.js 20 · TypeScript · LangChain.js · OpenAI · PostgreSQL + pgvector · Model Context Protocol · Zod · Vitest · Railway · Neon
