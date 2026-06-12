import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'manojsalugu-debug/test-allocations';
const WORKFLOWS = {
  ui: 'run-ui-tests.yml',
  api: 'run-api-tests.yml',
} as const;

type ReportType = keyof typeof WORKFLOWS;

interface RunEntry {
  id: string;
  type: ReportType;
  status: 'passed' | 'failed';
  date: string;
  runUrl: string | null;
}

interface GhWorkflowRun {
  id: number;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

async function fetchWorkflowRuns(type: ReportType, token: string): Promise<RunEntry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOWS[type]}/runs?per_page=25`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return ((data.workflow_runs ?? []) as GhWorkflowRun[])
    .filter(r => r.conclusion === 'success' || r.conclusion === 'failure')
    .map(r => ({
      id: String(r.id),
      type,
      status: r.conclusion === 'success' ? 'passed' as const : 'failed' as const,
      date: r.created_at,
      runUrl: r.html_url,
    }));
}

function readStaticRuns(): RunEntry[] {
  try {
    const filePath = path.join(process.cwd(), 'public', 'runs.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Live run history from GitHub Actions — no Vercel redeploy required. */
export async function GET() {
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    const [uiRuns, apiRuns] = await Promise.all([
      fetchWorkflowRuns('ui', token),
      fetchWorkflowRuns('api', token),
    ]);
    const merged = [...uiRuns, ...apiRuns].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return NextResponse.json(merged.slice(0, 50));
  }

  return NextResponse.json(readStaticRuns());
}
