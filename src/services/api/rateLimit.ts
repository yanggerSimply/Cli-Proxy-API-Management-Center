/**
 * Rate Limit 配置相关 API
 */

import { apiClient } from './client';

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  warnThreshold: number;
  exponentialBackoff: boolean;
}

export const rateLimitApi = {
  async getRateLimit(): Promise<RateLimitConfig> {
    const data = await apiClient.get<Record<string, unknown>>('/rate-limit');
    const rl = (data?.['rate-limit'] ?? data?.rateLimit ?? data) as Record<string, unknown>;
    return {
      rpm: Number(rl?.rpm ?? rl?.RPM ?? 0),
      tpm: Number(rl?.tpm ?? rl?.TPM ?? 0),
      warnThreshold: Number(rl?.['warn-threshold'] ?? rl?.warnThreshold ?? 0.8),
      exponentialBackoff: Boolean(rl?.['exponential-backoff'] ?? rl?.exponentialBackoff ?? false),
    };
  },

  updateRateLimit: (config: Partial<RateLimitConfig>) => {
    const payload: Record<string, unknown> = {};
    if (config.rpm !== undefined) payload.rpm = config.rpm;
    if (config.tpm !== undefined) payload.tpm = config.tpm;
    if (config.warnThreshold !== undefined) payload['warn-threshold'] = config.warnThreshold;
    if (config.exponentialBackoff !== undefined) payload['exponential-backoff'] = config.exponentialBackoff;
    return apiClient.put('/rate-limit', payload);
  },

  clearRateLimit: () => apiClient.delete('/rate-limit'),
};
