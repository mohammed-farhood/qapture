/**
 * SettingsSheet — the one place a tester sets up a session.
 *
 * Four things live here, in the order they matter to someone who has just
 * been handed a beta link:
 *
 *  1. SAVE TO A FOLDER — pick a QA folder once, name the project and the
 *     campaign, and every note is written to disk as it is saved. This is the
 *     answer to "my notes disappeared": browser storage is not a filing
 *     cabinet, a folder is.
 *  2. STORAGE — what the browser is actually complaining about when it says
 *     storage is full, how much room is left, and two ways out (let the
 *     browser protect the data, or drop screenshots and keep the findings).
 *  3. SCREENSHOTS — opt into pixel-exact capture (a real photo of the tab
 *     rather than a redraw of the DOM).
 *  4. VIEW — simple mode and the small capture box, for testers who do not
 *     need the guide/logins machinery.
 *
 * Rendered as a sheet over the panel body (same pattern as the export-name
 * dialog) so it never becomes a fourth tab competing with Notes.
 */

import { useEffect, useState } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import { formatBytes } from '../lib/storageHealth';

function Section({
  icon,
  title,
  children,
}: {
  icon: 'Folder' | 'HardDrive' | 'Camera' | 'Settings';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="qa-space-y-2">
      <h3 className="qa-flex qa-items-center qa-gap-1.5 qa-m-0 qa-text-xs qa-font-semibold qa-text-hi">
        <Icon name={icon} size={13} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="qa-block">
      <span className="qa-block qa-text-10 qa-text-lo qa-mb-1">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="qa-w-full qa-rounded-lg qa-border qa-border-subtle qa-bg-2 qa-text-hi qa-px-2 qa-py-1.5 qa-text-xs qa-focus-ring"
        style={{ outline: 'none' }}
      />
    </label>
  );
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const {
    t, dir,
    sync, chooseSyncFolder, reconnectSyncFolder, startSyncCampaign,
    stopSyncCampaign, forgetSyncFolder, suggestCampaignName, lastCampaign,
    storageHealth, refreshStorageHealth, requestPersistentStorage, dropAllScreenshots,
    autoBackup, setAutoBackup, autoBackupEvery,
    exactShots, enableExactShots, disableExactShots,
    simpleMode, setSimpleMode, compactCapture, setCompactCapture,
    notes,
  } = useQa();

  const [project, setProject] = useState(lastCampaign.project);
  const [campaign, setCampaign] = useState(lastCampaign.campaign || suggestCampaignName());
  const [tester, setTester] = useState(lastCampaign.tester);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refreshStorageHealth(); }, [refreshStorageHealth]);

  // Escape closes, matching the export-name dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const syncing = sync.state === 'syncing';
  const quotaKnown = storageHealth.supported && storageHealth.quotaBytes > 0;
  const usedPct = quotaKnown ? Math.min(100, Math.round(storageHealth.ratio * 100)) : 0;
  const meterColor =
    storageHealth.level === 'critical' ? 'var(--qa-danger)'
      : storageHealth.level === 'warn' ? 'var(--qa-warn)'
        : 'var(--qa-accent)';

  return (
    <div
      className="qa-absolute qa-inset-0 qa-z-50 qa-flex qa-flex-col"
      style={{ background: 'var(--qa-surface-0)' }}
      dir={dir}
    >
      <div className="qa-flex qa-items-center qa-gap-2 qa-px-3 qa-py-2 qa-bg-1 qa-border-b qa-border-subtle">
        <Icon name="Settings" size={14} />
        <span className="qa-text-xs qa-font-semibold qa-text-hi">{t('settings')}</span>
        <button
          onClick={onClose}
          aria-label={t('done')}
          className="qa-tap-icon qa-ms-auto qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-11 qa-text-hi qa-hover-bg-2"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          {t('done')}
        </button>
      </div>

      <div className="qa-flex-1 qa-space-y-4 qa-overflow-y-auto qa-p-3">
        {/* ── 1. Folder sync ──────────────────────────────────────────────── */}
        <Section icon="Folder" title={t('sync_title')}>
          <p className="qa-m-0 qa-text-10 qa-text-lo qa-leading-relaxed">{t('sync_hint')}</p>

          {!sync.supported ? (
            <p className="qa-m-0 qa-rounded-lg qa-border qa-border-dashed qa-border-subtle qa-p-2 qa-text-10 qa-text-mid">
              {t('sync_unsupported')}
            </p>
          ) : sync.state === 'off' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(chooseSyncFolder)}
              className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Folder" size={13} />
              {t('sync_choose')}
            </button>
          ) : sync.state === 'needs-permission' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(reconnectSyncFolder)}
              className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-warn-tint qa-text-warn qa-border qa-border-subtle qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
              style={{ cursor: 'pointer' }}
            >
              <Icon name="RotateCcw" size={13} />
              {t('sync_reconnect')}
            </button>
          ) : syncing ? (
            <div className="qa-space-y-2">
              <p className="qa-m-0 qa-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-success-tint qa-text-success qa-px-2 qa-py-1.5 qa-text-10">
                <Icon name="FolderCheck" size={13} className="qa-shrink-0" />
                <span className="qa-truncate qa-dir-ltr" dir="ltr" title={sync.path}>{sync.path}</span>
              </p>
              <button
                type="button"
                onClick={stopSyncCampaign}
                className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                {t('sync_stop')}
              </button>
            </div>
          ) : (
            /* connected: folder chosen, campaign not open yet */
            <div className="qa-space-y-2">
              <p className="qa-m-0 qa-flex qa-items-center qa-gap-1.5 qa-text-10 qa-text-mid">
                <Icon name="Folder" size={12} className="qa-shrink-0" />
                <span className="qa-truncate qa-dir-ltr" dir="ltr">{sync.path}</span>
              </p>
              <Field label={t('sync_project')} value={project} placeholder={t('sync_project_ph')} onChange={setProject} />
              <Field label={t('sync_campaign')} value={campaign} placeholder={t('sync_campaign_ph')} onChange={setCampaign} />
              <Field label={t('sync_tester')} value={tester} placeholder={t('sync_tester_ph')} onChange={setTester} />
              <div className="qa-flex qa-flex-wrap qa-gap-2">
                <button
                  type="button"
                  disabled={busy || !project.trim() || !campaign.trim()}
                  onClick={() => void run(() => startSyncCampaign({
                    project: project.trim(),
                    campaign: campaign.trim(),
                    tester: tester.trim() || undefined,
                  }))}
                  className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  <Icon name="Check" size={13} />
                  {t('sync_start')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(forgetSyncFolder)}
                  className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
                  style={{ background: 'transparent', cursor: 'pointer' }}
                >
                  {t('sync_forget')}
                </button>
              </div>
            </div>
          )}
        </Section>

        <div className="qa-h-px qa-bg-3 qa-mt-3 qa-mb-4" />

        {/* ── 2. Storage ──────────────────────────────────────────────────── */}
        <Section icon="HardDrive" title={t('storage_title')}>
          <p className="qa-m-0 qa-text-10 qa-text-lo qa-leading-relaxed">{t('storage_explain')}</p>

          {quotaKnown && (
            <>
              <div
                className="qa-w-full qa-rounded-full qa-overflow-hidden qa-bg-3"
                role="img"
                aria-label={t('storage_used', {
                  used: formatBytes(storageHealth.usageBytes),
                  quota: formatBytes(storageHealth.quotaBytes),
                })}
                style={{ height: 6 }}
              >
                <div style={{ width: `${usedPct}%`, height: '100%', background: meterColor }} />
              </div>
              <p className="qa-m-0 qa-text-10 qa-text-mid">
                {t('storage_used', {
                  used: formatBytes(storageHealth.usageBytes),
                  quota: formatBytes(storageHealth.quotaBytes),
                })}
                {' · '}
                <span className="qa-text-lo">
                  Qapture {formatBytes(storageHealth.ownBytes)}
                </span>
              </p>
            </>
          )}

          {/* Auto-backup: the safety net for every browser that can't do
              folder saving. Sits under Storage because that is where a
              tester looks when they are worried about losing work. */}
          <label className="qa-flex qa-items-start qa-gap-2 qa-text-xs qa-text-hi" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              {t('autosave_label')}
              <span className="qa-block qa-text-10 qa-text-lo qa-leading-relaxed">
                {t('autosave_hint', { n: autoBackupEvery })}
              </span>
            </span>
          </label>

          <div className="qa-flex qa-flex-wrap qa-gap-2">
            {storageHealth.persisted ? (
              <span className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-bg-success-tint qa-text-success qa-px-2 qa-py-0.5 qa-text-10">
                <Icon name="CheckCircle2" size={11} />
                {t('persist_on')}
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(requestPersistentStorage)}
                className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                {t('persist_keep')}
              </button>
            )}
            {notes.some((n) => n.screenshot) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(dropAllScreenshots)}
                className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                {t('drop_shots')}
              </button>
            )}
          </div>
        </Section>

        <div className="qa-h-px qa-bg-3 qa-mt-3 qa-mb-4" />

        {/* ── 3. Screenshots ──────────────────────────────────────────────── */}
        <Section icon="Camera" title={t('exact_label')}>
          <p className="qa-m-0 qa-text-10 qa-text-lo qa-leading-relaxed">{t('exact_hint')}</p>
          {!exactShots.supported ? (
            <p className="qa-m-0 qa-text-10 qa-text-mid">{t('exact_unsupported')}</p>
          ) : exactShots.status === 'live' ? (
            <button
              type="button"
              onClick={disableExactShots}
              className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-success-tint qa-text-success qa-border qa-border-subtle qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
              style={{ cursor: 'pointer' }}
            >
              <Icon name="CheckCircle2" size={13} />
              {t('exact_on')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(enableExactShots)}
              className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold qa-text-hi qa-hover-bg-2"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              <Icon name="Camera" size={13} />
              {t('exact_turn_on')}
            </button>
          )}
        </Section>

        <div className="qa-h-px qa-bg-3 qa-mt-3 qa-mb-4" />

        {/* ── 4. View ─────────────────────────────────────────────────────── */}
        <Section icon="Settings" title={t('settings')}>
          <label className="qa-flex qa-items-center qa-gap-2 qa-text-xs qa-text-hi" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={simpleMode}
              onChange={(e) => setSimpleMode(e.target.checked)}
            />
            {t('simple_mode')}
          </label>
          <label className="qa-flex qa-items-center qa-gap-2 qa-text-xs qa-text-hi" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={compactCapture}
              onChange={(e) => setCompactCapture(e.target.checked)}
            />
            {t('compact_mode')}
          </label>
        </Section>
      </div>
    </div>
  );
}
