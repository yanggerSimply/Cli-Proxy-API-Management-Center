/**
 * Rate Limit 配置相关 API
 */

import { apiClient } from './client';

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  warnThreshold: number;
  exponentialBackoff: boolean;
  larkWebhook: string;
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
      larkWebhook: String(rl?.['lark-webhook'] ?? rl?.larkWebhook ?? ''),
    };
  },

  updateRateLimit: (config: Partial<RateLimitConfig>) => {
    const payload: Record<string, unknown> = {};
    if (config.rpm !== undefined) payload.rpm = config.rpm;
    if (config.tpm !== undefined) payload.tpm = config.tpm;
    if (config.warnThreshold !== undefined) payload['warn-threshold'] = config.warnThreshold;
    if (config.exponentialBackoff !== undefined) payload['exponential-backoff'] = config.exponentialBackoff;
    if (config.larkWebhook !== undefined) payload['lark-webhook'] = config.larkWebhook;
    return apiClient.put('/rate-limit', payload);
  },

  clearRateLimit: () => apiClient.delete('/rate-limit'),

  testLarkWebhook: async (webhookUrl: string): Promise<boolean> => {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'interactive',
          card: {
            header: {
              title: { tag: 'plain_text', content: '✅ CLIProxyAPI 通知测试' },
              template: 'green',
            },
            elements: [
              { tag: 'markdown', content: '**限流通知已配置成功**\n当触发 RPM/TPM 限流时，你会在这里收到告警。' },
              { tag: 'note', elements: [{ tag: 'plain_text', content: new Date().toISOString() }] },
            ],
          },
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  },
};
