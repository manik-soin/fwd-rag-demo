import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  FAITHFULNESS_THRESHOLD: z.coerce.number().default(7),
  FAITHFULNESS_REJECT_THRESHOLD: z.coerce.number().default(4),
  MAX_INPUT_LENGTH: z.coerce.number().default(2000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(10),
  CACHE_SIMILARITY_THRESHOLD: z.coerce.number().default(0.95),
  CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}

export function loadConfig(): EnvConfig {
  _config = null;
  return getConfig();
}
