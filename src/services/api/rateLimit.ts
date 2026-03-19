/**
 * Rate Limit 配置相关 API
 */

import { apiClient } from './client';

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  maxConcurrency: number;
  warnThreshold: number;
  exponentialBackoff: boolean;
  larkWebhook: string;
  larkPrefix: string;
  larkEvents: string;
}

export const rateLimitApi = {
  async getRateLimit(): Promise<RateLimitConfig> {
    const data = await apiClient.get<Record<string, unknown>>('/rate-limit');
    const rl = (data?.['rate-limit'] ?? data?.rateLimit ?? data) as Record<string, unknown>;
    return {
      rpm: Number(rl?.rpm ?? rl?.RPM ?? 0),
      tpm: Number(rl?.tpm ?? rl?.TPM ?? 0),
      maxConcurrency: Number(rl?.['max-concurrency'] ?? rl?.maxConcurrency ?? 0),
      warnThreshold: Number(rl?.['warn-threshold'] ?? rl?.warnThreshold ?? 0.8),
      exponentialBackoff: Boolean(rl?.['exponential-backoff'] ?? rl?.exponentialBackoff ?? false),
      larkWebhook: String(rl?.['lark-webhook'] ?? rl?.larkWebhook ?? ''),
      larkPrefix: String(rl?.['lark-prefix'] ?? rl?.larkPrefix ?? ''),
      larkEvents: String(rl?.['lark-events'] ?? rl?.larkEvents ?? ''),
    };
  },

  updateRateLimit: (config: Partial<RateLimitConfig>) => {
    const payload: Record<string, unknown> = {};
    if (config.rpm !== undefined) payload.rpm = config.rpm;
    if (config.tpm !== undefined) payload.tpm = config.tpm;
    if (config.maxConcurrency !== undefined) payload['max-concurrency'] = config.maxConcurrency;
    if (config.warnThreshold !== undefined) payload['warn-threshold'] = config.warnThreshold;
    if (config.exponentialBackoff !== undefined) payload['exponential-backoff'] = config.exponentialBackoff;
    if (config.larkWebhook !== undefined) payload['lark-webhook'] = config.larkWebhook;
    if (config.larkPrefix !== undefined) payload['lark-prefix'] = config.larkPrefix;
    if (config.larkEvents !== undefined) payload['lark-events'] = config.larkEvents;
    return apiClient.put('/rate-limit', payload);
  },

  clearRateLimit: () => apiClient.delete('/rate-limit'),

  testLarkWebhook: async (): Promise<boolean> => {
    try {
      await apiClient.post('/rate-limit/test-lark', {});
      return true;
    } catch {
      return false;
    }
  },
};
