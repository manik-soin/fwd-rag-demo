import { CallbackHandler } from 'langfuse-langchain';

export function createLangfuseHandler(metadata: {
  tenantId: string;
  requestId: string;
  userId?: string;
}): CallbackHandler | undefined {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }

  return new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
    metadata,
    tags: ['fwd-rag-demo', metadata.tenantId],
  });
}
