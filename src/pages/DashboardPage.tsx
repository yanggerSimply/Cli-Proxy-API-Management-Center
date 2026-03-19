import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconKey,
  IconBot,
  IconFileText,
  IconSatellite
} from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Input } from '@/components/ui/Input';
import { useAuthStore, useConfigStore, useModelsStore, useNotificationStore } from '@/stores';
import { apiKeysApi, providersApi, authFilesApi } from '@/services/api';
import { rateLimitApi, type RateLimitConfig } from '@/services/api/rateLimit';
import styles from './DashboardPage.module.scss';

interface QuickStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  path: string;
  loading?: boolean;
  sublabel?: string;
}

interface ProviderStats {
  gemini: number | null;
  codex: number | null;
  claude: number | null;
  openai: number | null;
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);

  const { showNotification, showConfirmation } = useNotificationStore();

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [rateLimit, setRateLimit] = useState<RateLimitConfig | null>(null);
  const [rlDraft, setRlDraft] = useState<RateLimitConfig>({ rpm: 0, tpm: 0, warnThreshold: 0.8, exponentialBackoff: false });
  const [rlSaving, setRlSaving] = useState(false);
  const [rlLoading, setRlLoading] = useState(false);

  const fetchRateLimit = useCallback(async () => {
    if (connectionStatus !== 'connected') return;
    setRlLoading(true);
    try {
      const data = await rateLimitApi.getRateLimit();
      setRateLimit(data);
      setRlDraft(data);
    } catch {
      // ignore
    } finally {
      setRlLoading(false);
    }
  }, [connectionStatus]);

  const handleRlSave = async () => {
    setRlSaving(true);
    try {
      await rateLimitApi.updateRateLimit(rlDraft);
      setRateLimit(rlDraft);
      showNotification(t('basic_settings.rate_limit_updated'), 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.update_failed')}${msg ? `: ${msg}` : ''}`, 'error');
    } finally {
      setRlSaving(false);
    }
  };

  const handleRlReset = () => {
    showConfirmation({
      title: t('basic_settings.rate_limit_reset'),
      message: t('basic_settings.rate_limit_reset_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        setRlSaving(true);
        try {
          await rateLimitApi.clearRateLimit();
          const cleared = { rpm: 0, tpm: 0, warnThreshold: 0.8, exponentialBackoff: false };
          setRateLimit(cleared);
          setRlDraft(cleared);
          showNotification(t('basic_settings.rate_limit_reset_success'), 'success');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.update_failed')}${msg ? `: ${msg}` : ''}`, 'error');
        } finally {
          setRlSaving(false);
        }
      },
    });
  };

  const rlDirty = rateLimit !== null && (
    rlDraft.rpm !== rateLimit.rpm ||
    rlDraft.tpm !== rateLimit.tpm ||
    rlDraft.warnThreshold !== rateLimit.warnThreshold ||
    rlDraft.exponentialBackoff !== rateLimit.exponentialBackoff
  );

  useEffect(() => { fetchRateLimit(); }, [fetchRateLimit]);

  const [stats, setStats] = useState<{
    apiKeys: number | null;
    authFiles: number | null;
  }>({
    apiKeys: null,
    authFiles: null
  });

  const [providerStats, setProviderStats] = useState<ProviderStats>({
    gemini: null,
    codex: null,
    claude: null,
    openai: null
  });

  const [loading, setLoading] = useState(true);

  const apiKeysCache = useRef<string[]>([]);

  useEffect(() => {
    apiKeysCache.current = [];
  }, [apiBase, config?.apiKeys]);

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch {
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = useCallback(async () => {
    if (connectionStatus !== 'connected' || !apiBase) {
      return;
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(apiBase, primaryKey);
    } catch {
      // Ignore model fetch errors on dashboard
    }
  }, [connectionStatus, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [keysRes, filesRes, geminiRes, codexRes, claudeRes, openaiRes] = await Promise.allSettled([
          apiKeysApi.list(),
          authFilesApi.list(),
          providersApi.getGeminiKeys(),
          providersApi.getCodexConfigs(),
          providersApi.getClaudeConfigs(),
          providersApi.getOpenAIProviders()
        ]);

        setStats({
          apiKeys: keysRes.status === 'fulfilled' ? keysRes.value.length : null,
          authFiles: filesRes.status === 'fulfilled' ? filesRes.value.files.length : null
        });

        setProviderStats({
          gemini: geminiRes.status === 'fulfilled' ? geminiRes.value.length : null,
          codex: codexRes.status === 'fulfilled' ? codexRes.value.length : null,
          claude: claudeRes.status === 'fulfilled' ? claudeRes.value.length : null,
          openai: openaiRes.status === 'fulfilled' ? openaiRes.value.length : null
        });
      } finally {
        setLoading(false);
      }
    };

    if (connectionStatus === 'connected') {
      fetchStats();
      fetchModels();
    } else {
      setLoading(false);
    }
  }, [connectionStatus, fetchModels]);

  // Calculate total provider keys only when all provider stats are available.
  const providerStatsReady =
    providerStats.gemini !== null &&
    providerStats.codex !== null &&
    providerStats.claude !== null &&
    providerStats.openai !== null;
  const hasProviderStats =
    providerStats.gemini !== null ||
    providerStats.codex !== null ||
    providerStats.claude !== null ||
    providerStats.openai !== null;
  const totalProviderKeys = providerStatsReady
    ? (providerStats.gemini ?? 0) +
      (providerStats.codex ?? 0) +
      (providerStats.claude ?? 0) +
      (providerStats.openai ?? 0)
    : 0;

  const quickStats: QuickStat[] = [
    {
      label: t('dashboard.management_keys'),
      value: stats.apiKeys ?? '-',
      icon: <IconKey size={24} />,
      path: '/config',
      loading: loading && stats.apiKeys === null,
      sublabel: t('nav.config_management')
    },
    {
      label: t('nav.ai_providers'),
      value: loading ? '-' : providerStatsReady ? totalProviderKeys : '-',
      icon: <IconBot size={24} />,
      path: '/ai-providers',
      loading: loading,
      sublabel: hasProviderStats
        ? t('dashboard.provider_keys_detail', {
            gemini: providerStats.gemini ?? '-',
            codex: providerStats.codex ?? '-',
            claude: providerStats.claude ?? '-',
            openai: providerStats.openai ?? '-'
          })
        : undefined
    },
    {
      label: t('nav.auth_files'),
      value: stats.authFiles ?? '-',
      icon: <IconFileText size={24} />,
      path: '/auth-files',
      loading: loading && stats.authFiles === null,
      sublabel: t('dashboard.oauth_credentials')
    },
    {
      label: t('dashboard.available_models'),
      value: modelsLoading ? '-' : models.length,
      icon: <IconSatellite size={24} />,
      path: '/system',
      loading: modelsLoading,
      sublabel: t('dashboard.available_models_desc')
    }
  ];

  const routingStrategyRaw = config?.routingStrategy?.trim() || '';
  const routingStrategyDisplay = !routingStrategyRaw
    ? '-'
    : routingStrategyRaw === 'round-robin'
      ? t('basic_settings.routing_strategy_round_robin')
      : routingStrategyRaw === 'fill-first'
        ? t('basic_settings.routing_strategy_fill_first')
        : routingStrategyRaw;
  const routingStrategyBadgeClass = !routingStrategyRaw
    ? styles.configBadgeUnknown
    : routingStrategyRaw === 'round-robin'
      ? styles.configBadgeRoundRobin
      : routingStrategyRaw === 'fill-first'
        ? styles.configBadgeFillFirst
        : styles.configBadgeUnknown;

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title')}</h1>
        <p className={styles.subtitle}>{t('dashboard.subtitle')}</p>
      </div>

      <div className={styles.connectionCard}>
        <div className={styles.connectionStatus}>
          <span
            className={`${styles.statusDot} ${
              connectionStatus === 'connected'
                ? styles.connected
                : connectionStatus === 'connecting'
                  ? styles.connecting
                  : styles.disconnected
            }`}
          />
          <span className={styles.statusText}>
            {t(
              connectionStatus === 'connected'
                ? 'common.connected'
                : connectionStatus === 'connecting'
                  ? 'common.connecting'
                  : 'common.disconnected'
            )}
          </span>
        </div>
        <div className={styles.connectionInfo}>
          <span className={styles.serverUrl}>{apiBase || '-'}</span>
          {serverVersion && (
            <span className={styles.serverVersion}>
              v{serverVersion.trim().replace(/^[vV]+/, '')}
            </span>
          )}
          {serverBuildDate && (
            <span className={styles.buildDate}>
              {new Date(serverBuildDate).toLocaleDateString(i18n.language)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        {quickStats.map((stat) => (
          <Link key={stat.path} to={stat.path} className={styles.statCard}>
            <div className={styles.statIcon}>{stat.icon}</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{stat.loading ? '...' : stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
              {stat.sublabel && !stat.loading && (
                <span className={styles.statSublabel}>{stat.sublabel}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {config && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('dashboard.current_config')}</h2>
          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.debug_enable')}</span>
              <span className={`${styles.configValue} ${config.debug ? styles.enabled : styles.disabled}`}>
                {config.debug ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.usage_statistics_enable')}</span>
              <span className={`${styles.configValue} ${config.usageStatisticsEnabled ? styles.enabled : styles.disabled}`}>
                {config.usageStatisticsEnabled ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.logging_to_file_enable')}</span>
              <span className={`${styles.configValue} ${config.loggingToFile ? styles.enabled : styles.disabled}`}>
                {config.loggingToFile ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.retry_count_label')}</span>
              <span className={styles.configValue}>{config.requestRetry ?? 0}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.ws_auth_enable')}</span>
              <span className={`${styles.configValue} ${config.wsAuth ? styles.enabled : styles.disabled}`}>
                {config.wsAuth ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('dashboard.routing_strategy')}</span>
              <span className={`${styles.configBadge} ${routingStrategyBadgeClass}`}>
                {routingStrategyDisplay}
              </span>
            </div>
            {config.proxyUrl && (
              <div className={`${styles.configItem} ${styles.configItemFull}`}>
                <span className={styles.configLabel}>{t('basic_settings.proxy_url_label')}</span>
                <span className={styles.configValueMono}>{config.proxyUrl}</span>
              </div>
            )}
          </div>
          <Link to="/config" className={styles.viewMoreLink}>
            {t('dashboard.edit_settings')} →
          </Link>
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('basic_settings.rate_limit_title')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {t('basic_settings.rate_limit_desc')}
          </p>
          {rlLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.configGrid}>
                <div className={styles.configItem} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span className={styles.configLabel}>{t('basic_settings.rate_limit_rpm')}</span>
                  <Input
                    type="number"
                    placeholder="0"
                    value={String(rlDraft.rpm)}
                    onChange={(e) => setRlDraft(prev => ({ ...prev, rpm: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={rlSaving}
                    hint={t('basic_settings.rate_limit_rpm_desc')}
                  />
                </div>
                <div className={styles.configItem} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span className={styles.configLabel}>{t('basic_settings.rate_limit_tpm')}</span>
                  <Input
                    type="number"
                    placeholder="0"
                    value={String(rlDraft.tpm)}
                    onChange={(e) => setRlDraft(prev => ({ ...prev, tpm: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={rlSaving}
                    hint={t('basic_settings.rate_limit_tpm_desc')}
                  />
                </div>
                <div className={styles.configItem} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span className={styles.configLabel}>{t('basic_settings.rate_limit_warn_threshold')}</span>
                  <Input
                    type="number"
                    placeholder="0.8"
                    value={String(rlDraft.warnThreshold)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setRlDraft(prev => ({ ...prev, warnThreshold: Math.min(1, Math.max(0, v)) }));
                    }}
                    disabled={rlSaving}
                    hint={t('basic_settings.rate_limit_warn_threshold_desc')}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('basic_settings.rate_limit_exponential_backoff')}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{t('basic_settings.rate_limit_exponential_backoff_desc')}</div>
                </div>
                <ToggleSwitch
                  checked={rlDraft.exponentialBackoff}
                  onChange={(v) => setRlDraft(prev => ({ ...prev, exponentialBackoff: v }))}
                  disabled={rlSaving}
                  ariaLabel={t('basic_settings.rate_limit_exponential_backoff')}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="danger" size="sm" onClick={handleRlReset} disabled={rlSaving}>
                  {t('basic_settings.rate_limit_reset')}
                </Button>
                <Button size="sm" onClick={handleRlSave} loading={rlSaving} disabled={!rlDirty || rlSaving}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
