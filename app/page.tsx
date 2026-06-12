'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';

type RunStatus = 'idle' | 'queued' | 'in_progress' | 'completed';
type ReportType = 'ui' | 'api';
type View = 'list' | 'report';

interface RunEntry {
  id: string;
  type: ReportType;
  status: 'passed' | 'failed';
  date: string;
  runUrl?: string | null;
}

type LiveRunEntry = RunEntry & { live: true; running: boolean };

interface RunnerState {
  status: RunStatus;
  conclusion: string | null;
  runUrl: string | null;
  runId: string | null;
  triggering: boolean;
  publishing: boolean;
  countdown: number | null;
  error: string | null;
}

const DEPLOY_SECS = 70;
const PRIMARY = '#05c168';

function useTestRunner(type: ReportType, onReportsReady: () => void) {
  const [state, setState] = useState<RunnerState>({
    status: 'idle', conclusion: null, runUrl: null, runId: null,
    triggering: false, publishing: false, countdown: null, error: null,
  });
  const triggerTimeRef = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/test-status?type=${type}`);
      const data = await res.json();
      const runId = data.run_id ?? null;
      if (runId) runIdRef.current = runId;
      setState(s => ({
        ...s,
        status: data.status ?? 'idle',
        conclusion: data.conclusion ?? null,
        runUrl: data.html_url ?? null,
        runId,
      }));
    } catch { /* ignore */ }
  }, [type]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    const active = state.status === 'queued' || state.status === 'in_progress';
    if (!active) return;
    const id = setInterval(checkStatus, 10_000);
    return () => clearInterval(id);
  }, [state.status, checkStatus]);

  useEffect(() => {
    if (state.status !== 'completed') return;
    const t0 = triggerTimeRef.current;
    if (!t0) return;

    setState(s => ({ ...s, publishing: true, countdown: DEPLOY_SECS }));

    const countdownId = setInterval(() => {
      setState(s => ({ ...s, countdown: s.countdown !== null && s.countdown > 1 ? s.countdown - 1 : null }));
    }, 1_000);

    const resolve = () => {
      clearInterval(countdownId);
      clearInterval(pollId);
      clearTimeout(forceId);
      triggerTimeRef.current = null;
      runIdRef.current = null;
      setState(s => ({ ...s, publishing: false, countdown: null }));
      onReportsReady();
    };

    const forceId = setTimeout(resolve, DEPLOY_SECS * 1_000);

    const pollId = setInterval(async () => {
      try {
        const markerRes = await fetch(`/last-updated-${type}.json?_=${Date.now()}`);
        const marker = await markerRes.json();
        if (marker.timestamp > t0) resolve();
      } catch { /* ignore */ }
    }, 5_000);

    return () => { clearInterval(countdownId); clearInterval(pollId); clearTimeout(forceId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const run = useCallback(async () => {
    setState(s => ({ ...s, triggering: true, error: null }));
    triggerTimeRef.current = Date.now();
    try {
      const res = await fetch(`/api/run-tests?type=${type}`, { method: 'POST' });
      if (res.ok) {
        setState(s => ({ ...s, status: 'queued', conclusion: null, runUrl: null, runId: null }));
      } else {
        const data = await res.json().catch(() => ({}));
        triggerTimeRef.current = null;
        runIdRef.current = null;
        setState(s => ({ ...s, error: data.error ?? `Error ${res.status}` }));
      }
    } catch {
      triggerTimeRef.current = null;
      runIdRef.current = null;
      setState(s => ({ ...s, error: 'Network error.' }));
    } finally {
      setState(s => ({ ...s, triggering: false }));
    }
  }, [type]);

  return { ...state, run };
}

function Spinner({ size = 14, color = PRIMARY }: { size?: number; color?: string }) {
  return (
    <span
      className="alloc-spinner"
      style={{ width: size, height: size, borderColor: `${color}28`, borderTopColor: color }}
    />
  );
}

function PulseDot({ color = '#d97706' }: { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, animation: 'qa-ping 1.4s ease-out infinite' }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, position: 'relative' }} />
    </span>
  );
}

function BounceDots({ color = PRIMARY }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {([0, 0.18, 0.36] as number[]).map((delay, i) => (
        <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: color, animation: `qa-bounce 1s ease-in-out ${delay}s infinite` }} />
      ))}
    </span>
  );
}

function Icon({ name }: { name: 'runs' | 'ui' | 'api' | 'search' }) {
  const paths = {
    runs: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    ui: <><rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" fill="none" /><path d="M8 20h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></>,
    api: <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    search: <><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" fill="none" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></>,
  };
  return (
    <svg className="alloc-nav-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      {paths[name]}
    </svg>
  );
}

function StatusBadge({ runner }: { runner: ReturnType<typeof useTestRunner> }) {
  const { status, conclusion, publishing, countdown } = runner;
  if (publishing) {
    return (
      <span className="alloc-pill alloc-pill-info">
        <Spinner size={11} />Deploying{countdown !== null ? ` ${countdown}s` : ''}<BounceDots />
      </span>
    );
  }
  if (status === 'queued') return <span className="alloc-pill alloc-pill-warning"><Spinner size={11} color="#d97706" />Queued</span>;
  if (status === 'in_progress') return <span className="alloc-pill alloc-pill-warning"><Spinner size={11} color="#d97706" />Running</span>;
  if (status === 'completed') {
    const ok = conclusion === 'success';
    return <span className={`alloc-pill ${ok ? 'alloc-pill-success' : 'alloc-pill-error'}`}>{ok ? '✓ Passed' : '✗ Failed'}</span>;
  }
  return null;
}

function RunButton({ runner, label }: { runner: ReturnType<typeof useTestRunner>; label: string }) {
  const busy = runner.triggering || runner.status === 'queued' || runner.status === 'in_progress' || runner.publishing;
  return (
    <button type="button" onClick={runner.run} disabled={busy} className="alloc-btn alloc-btn-primary">
      {busy && <Spinner size={12} color="#fff" />}
      {runner.triggering ? 'Triggering…' : runner.status === 'in_progress' ? 'Running…' : runner.publishing ? 'Deploying…' : label}
    </button>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function AppShell({
  view,
  activeType,
  onNavigateList,
  onNavigateReport,
  topBar,
  banners,
  children,
}: {
  view: View;
  activeType: ReportType;
  onNavigateList: () => void;
  onNavigateReport: (type: ReportType) => void;
  topBar: React.ReactNode;
  banners?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="alloc-shell">
      <aside className="alloc-sidebar">
        <div className="alloc-sidebar-logo">
          <Image src="/logo.svg" alt="Allocations" width={160} height={22} priority />
        </div>

        <nav className="alloc-sidebar-nav">
          <div className="alloc-nav-group">
            <div className="alloc-nav-label">Platform</div>
            <button type="button" className={`alloc-nav-item${view === 'list' ? ' active' : ''}`} onClick={onNavigateList}>
              <Icon name="runs" />
              Test Runs
            </button>
          </div>

          <div className="alloc-nav-group">
            <div className="alloc-nav-label">Reports</div>
            <button
              type="button"
              className={`alloc-nav-item${view === 'report' && activeType === 'ui' ? ' active' : ''}`}
              onClick={() => onNavigateReport('ui')}
            >
              <Icon name="ui" />
              UI Reports
            </button>
            <button
              type="button"
              className={`alloc-nav-item${view === 'report' && activeType === 'api' ? ' active' : ''}`}
              onClick={() => onNavigateReport('api')}
            >
              <Icon name="api" />
              API Reports
            </button>
          </div>
        </nav>

        <div className="alloc-sidebar-footer">
          <div className="alloc-user-avatar">Q</div>
          <div className="alloc-user-meta">
            <div className="alloc-user-name">QA Dashboard</div>
            <div className="alloc-user-role">Test execution</div>
          </div>
        </div>
      </aside>

      <div className="alloc-main">
        <header className="alloc-topbar">
          <div className="alloc-search">
            <Icon name="search" />
            <input type="search" placeholder="Search test runs, reports, and workflows…" aria-label="Search" />
            <span className="alloc-search-kbd alloc-hide-mobile">⌘ K</span>
          </div>
          <div className="alloc-topbar-actions">{topBar}</div>
        </header>

        {banners}

        <div className="alloc-main-body">{children}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('list');
  const [activeType, setActiveType] = useState<ReportType>('ui');
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [iframeKey, setIframeKey] = useState(() => Date.now());

  const refreshRuns = useCallback(() => {
    fetch('/api/runs?_=' + Date.now())
      .then(r => r.json())
      .then(d => setRuns(Array.isArray(d) ? d : []))
      .catch(() => {
        fetch('/runs.json?_=' + Date.now())
          .then(r => r.json())
          .then(d => setRuns(Array.isArray(d) ? d : []))
          .catch(() => {});
      });
  }, []);

  useEffect(() => { refreshRuns(); }, [refreshRuns]);

  const onReady = useCallback(() => {
    setIframeKey(Date.now());
    refreshRuns();
  }, [refreshRuns]);

  const ui = useTestRunner('ui', onReady);
  const api = useTestRunner('api', onReady);

  // Keep execution history in sync with GitHub while tests run or reports deploy
  useEffect(() => {
    const busy = [ui, api].some(
      r => r.status === 'queued' || r.status === 'in_progress' || r.publishing
    );
    if (!busy) return;
    const id = setInterval(refreshRuns, 5_000);
    return () => clearInterval(id);
  }, [ui.status, ui.publishing, api.status, api.publishing, refreshRuns]);

  const openReport = (type: ReportType) => { setActiveType(type); setView('report'); };
  const runner = activeType === 'ui' ? ui : api;
  const reportBase = activeType === 'ui' ? '/ui-report/index.html' : '/api-report.html';
  const reportSrc = `${reportBase}?v=${iframeKey}`;

  const activeRunners = (['ui', 'api'] as const)
    .map(t => ({ type: t, runner: t === 'ui' ? ui : api }))
    .filter(({ runner }) =>
      runner.status === 'queued' ||
      runner.status === 'in_progress' ||
      runner.publishing
    );

  const liveIds = new Set(
    activeRunners.map(({ runner }) => runner.runId).filter(Boolean) as string[]
  );

  const liveRows: LiveRunEntry[] = activeRunners.map(({ type: t, runner: r }) => ({
    id: r.runId ?? `live-${t}`,
    type: t,
    status: r.conclusion === 'failure' ? 'failed' as const : r.conclusion === 'success' ? 'passed' as const : 'passed' as const,
    date: new Date().toISOString(),
    runUrl: r.runUrl,
    live: true,
    running: r.status === 'queued' || r.status === 'in_progress',
  }));

  const historyRows = runs.filter(r => !liveIds.has(r.id));
  const allRows = [...liveRows, ...historyRows];
  const isPublishing = ui.publishing || api.publishing;
  const errorMsg = ui.error || api.error;

  const completedRows = [...liveRows.filter(r => !r.running), ...historyRows];
  const total = completedRows.length;
  const passed = completedRows.filter(r => r.status === 'passed').length;
  const passRate = total ? Math.round((passed / total) * 100) : null;

  const topBar = (
    <>
      <StatusBadge runner={ui} />
      <RunButton runner={ui} label="Run UI Tests" />
      <StatusBadge runner={api} />
      <RunButton runner={api} label="Run API Tests" />
    </>
  );

  const banners = (
    <>
      {errorMsg && <div className="alloc-banner alloc-banner-error">⚠ {errorMsg}</div>}
      {isPublishing && (
        <div className="alloc-banner alloc-banner-info">
          <Spinner size={13} />
          <span>
            Deploying updated reports
            {(ui.publishing ? ui : api).countdown !== null ? ` — auto-refreshing in ${(ui.publishing ? ui : api).countdown}s` : '…'}
          </span>
          <BounceDots />
        </div>
      )}
    </>
  );

  if (view === 'report') {
    return (
      <AppShell
        view={view}
        activeType={activeType}
        onNavigateList={() => setView('list')}
        onNavigateReport={openReport}
        topBar={topBar}
        banners={
          <>
            {runner.error && <div className="alloc-banner alloc-banner-error">⚠ {runner.error}</div>}
            {runner.publishing && (
              <div className="alloc-banner alloc-banner-info">
                <Spinner size={13} />
                Deploying{runner.countdown !== null ? ` — auto-refreshing in ${runner.countdown}s` : '…'}
              </div>
            )}
          </>
        }
      >
        <div className="alloc-content alloc-content-scroll" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="alloc-page-header">
              <h1 className="alloc-page-title">{activeType === 'ui' ? 'UI' : 'API'} Report</h1>
              <p className="alloc-page-subtitle">Playwright test results and execution details</p>
            </div>

            <div className="alloc-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="alloc-report-toolbar">
                <button type="button" className="alloc-btn alloc-btn-outline" onClick={() => setView('list')}>← Test Runs</button>
                <StatusBadge runner={runner} />
                <div className="alloc-report-toolbar-actions">
                  {runner.runUrl && (
                    <a href={runner.runUrl} target="_blank" rel="noreferrer" className="alloc-external-link alloc-hide-mobile">
                      View GH run ↗
                    </a>
                  )}
                  {activeType === 'api' && (
                    <a href="/api-logs.html" target="_blank" rel="noreferrer" className="alloc-btn alloc-btn-outline" style={{ textDecoration: 'none' }}>
                      Logs ↗
                    </a>
                  )}
                  <RunButton runner={runner} label={`Run ${activeType.toUpperCase()} Tests`} />
                  <a href={reportSrc} target="_blank" rel="noreferrer" className="alloc-btn alloc-btn-outline alloc-hide-mobile" style={{ textDecoration: 'none' }}>
                    Open ↗
                  </a>
                </div>
              </div>
              <iframe key={`${reportSrc}-${iframeKey}`} src={reportSrc} className="alloc-report-frame" title={`${activeType.toUpperCase()} Report`} />
            </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      view={view}
      activeType={activeType}
      onNavigateList={() => setView('list')}
      onNavigateReport={openReport}
      topBar={topBar}
      banners={banners}
    >
      <div className="alloc-content alloc-content-scroll">
        <div className="alloc-page-header">
          <h1 className="alloc-page-title">Test Runs</h1>
          <p className="alloc-page-subtitle">Manage and trigger QA test executions</p>
        </div>

        {total > 0 && (
          <div className="alloc-stats">
            {[
              { label: 'Total Runs', value: total, color: 'hsl(var(--foreground))' },
              { label: 'Passed', value: passed, color: 'var(--color-bullish)' },
              { label: 'Failed', value: total - passed, color: 'var(--color-bearish)' },
              { label: 'Pass Rate', value: `${passRate}%`, color: passRate === 100 ? 'var(--color-bullish)' : passRate! >= 80 ? '#d97706' : 'var(--color-bearish)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="alloc-card alloc-stat">
                <div className="alloc-stat-label">{label}</div>
                <div className="alloc-stat-value" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="alloc-card">
          <div className="alloc-card-header">
            <h2 className="alloc-card-title">Execution History</h2>
            {liveRows.length > 0 && <span className="alloc-live-badge">● Live</span>}
          </div>

          {allRows.length === 0 ? (
            <div className="alloc-empty">
              <div className="alloc-empty-icon">
                <Icon name="runs" />
              </div>
              <div className="alloc-empty-title">Nothing to display</div>
              <div className="alloc-empty-text">
                Run <strong>UI Tests</strong> or <strong>API Tests</strong> from the toolbar to get started.
              </div>
            </div>
          ) : (
            <div className="alloc-table-wrap">
              <table className="alloc-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Date &amp; Time</th>
                    <th className="alloc-hide-mobile">GH Run</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(run => {
                    const live = 'live' in run;
                    const running = live && (run as LiveRunEntry).running;
                    return (
                      <tr key={run.id}>
                        <td>
                          {running ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <PulseDot />
                              <span style={{ color: '#d97706', fontWeight: 600 }}>Running…</span>
                            </span>
                          ) : (
                            <span className={`alloc-pill ${run.status === 'passed' ? 'alloc-pill-success' : 'alloc-pill-error'}`}>
                              {run.status === 'passed' ? '✓ Passed' : '✗ Failed'}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="alloc-pill alloc-pill-neutral">{run.type.toUpperCase()}</span>
                        </td>
                        <td style={{ color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                          {running ? 'Just now…' : fmt(run.date)}
                        </td>
                        <td className="alloc-hide-mobile">
                          {!running && run.runUrl && (
                            <a href={run.runUrl} target="_blank" rel="noreferrer" className="alloc-external-link">
                              #{String(run.id).slice(-8)} ↗
                            </a>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!running && (
                            <button type="button" className="alloc-btn alloc-btn-ghost" onClick={() => openReport(run.type)}>
                              View →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
