import { useEffect, useMemo, useState } from 'react';

import { Timeline } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EcosystemCommitHistory, EcosystemCommitRecord } from '@/types';
// @ts-ignore
import history from '@data';

const DATA_SOURCE =
  import.meta.env.RSBUILD_PUBLIC_DATA_SOURCE === 'mock' ? 'mock' : 'remote';

const STACKS = [
  { id: 'rspack', label: 'Rspack' },
  { id: 'rsbuild', label: 'Rsbuild' },
  { id: 'rslib', label: 'Rslib' },
  { id: 'rstest', label: 'Rstest' },
] as const;

type StackId = (typeof STACKS)[number]['id'];

const DEFAULT_STACK: StackId = 'rspack';

// Get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    stack: params.get('stack') as StackId | null,
    suite: params.get('suite') || 'all',
  };
}

// Set URL parameters
function setUrlParams(stack: StackId, suite: string) {
  const params = new URLSearchParams();
  params.set('stack', stack);
  if (suite !== 'all') {
    params.set('suite', suite);
  }
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

export default function App() {
  const historySource = history as Record<StackId, EcosystemCommitHistory>;

  const [selectedStack, setSelectedStack] = useState<StackId>(() => {
    const urlParams = getUrlParams();
    if (urlParams.stack && STACKS.some((s) => s.id === urlParams.stack)) {
      return urlParams.stack;
    }
    return DEFAULT_STACK;
  });

  const [selectedSuite, setSelectedSuite] = useState<string>(() => {
    const urlParams = getUrlParams();
    return urlParams.suite;
  });

  const historyByStack = useMemo(() => {
    const map = {} as Record<StackId, EcosystemCommitHistory>;
    for (const { id } of STACKS) {
      const list = historySource[id] ?? [];
      map[id] = [...list].sort(
        (a, b) =>
          new Date(b.commitTimestamp).getTime() -
          new Date(a.commitTimestamp).getTime(),
      );
    }
    return map;
  }, [historySource]);

  // Update URL when stack or suite changes
  useEffect(() => {
    setUrlParams(selectedStack, selectedSuite);
  }, [selectedStack, selectedSuite]);

  const selectedStackMeta = useMemo(
    () => STACKS.find((stack) => stack.id === selectedStack),
    [selectedStack],
  );

  const stackEntries = historyByStack[selectedStack] ?? [];
  const stats = useMemo(() => buildStats(stackEntries), [stackEntries]);

  return (
    <div className="min-h-screen bg-transparent px-4 py-12 text-foreground sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
              Ecosystem CI
              {DATA_SOURCE === 'mock' ? (
                <Badge
                  variant="outline"
                  className="border-white/20 bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-white/70"
                >
                  Mock Data
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-12 w-12 items-center justify-center">
                <span
                  className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/35 blur-2xl"
                  aria-hidden
                />
                <img
                  src="https://assets.rspack.rs/rspack/rspack-logo.svg"
                  alt="Rspack logo"
                  className="relative h-10 w-10 drop-shadow-[0_4px_18px_rgba(34,211,238,0.75)]"
                />
              </span>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Rstack Ecosystem CI Dashboard
              </h1>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-4 sm:w-72">
            <Select
              value={selectedStack}
              onValueChange={(value) => setSelectedStack(value as StackId)}
            >
              <SelectTrigger>
                <div className="flex flex-1 items-center justify-between gap-3">
                  <span className="truncate font-medium text-foreground/90">
                    {selectedStackMeta?.label ?? 'Select stack'}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-border/40 text-[11px]"
                  >
                    {historyByStack[selectedStack]?.length ?? 0} runs
                  </Badge>
                </div>
                <SelectValue className="sr-only" placeholder="Select stack" />
              </SelectTrigger>
              <SelectContent>
                {STACKS.map((stack) => {
                  const total = historyByStack[stack.id]?.length ?? 0;
                  return (
                    <SelectItem key={stack.id} value={stack.id}>
                      <div className="flex w-full items-center justify-between gap-3">
                        <span>{stack.label}</span>
                        <Badge variant="outline">
                          {total === 0 ? 'No runs' : `${total} runs`}
                        </Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total tracked runs" value={stats.total} />
          <StatCard
            label="Pass ratio"
            value={stats.total ? `${Math.round(stats.passRate * 100)}%` : '—'}
          />
          <StatCard label="Last updated" value={stats.lastUpdated ?? '—'} />
        </section>

        <Timeline
          entries={stackEntries}
          selectedSuite={selectedSuite}
          onSuiteChange={setSelectedSuite}
        />
      </div>
    </div>
  );
}

function buildStats(records: EcosystemCommitRecord[]) {
  if (!records.length) {
    return {
      total: 0,
      passRate: 0,
      lastUpdated: null as string | null,
    };
  }

  const total = records.length;
  const passed = records.filter(
    (record) => record.overallStatus === 'success',
  ).length;
  const lastUpdated = records[0]?.commitTimestamp
    ? (() => {
        const date = new Date(records[0].commitTimestamp);
        const dateStr = new Intl.DateTimeFormat('en', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(date);
        const offset = -date.getTimezoneOffset() / 60;
        const utcStr = `UTC${offset >= 0 ? '+' : ''}${offset}`;
        return `${dateStr} ${utcStr}`;
      })()
    : null;

  return {
    total,
    passRate: total > 0 ? passed / total : 0,
    lastUpdated,
  };
}

interface StatCardProps {
  label: string;
  value: string | number | null;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="glass-panel rounded-2xl border border-border/60 px-6 py-5 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.65)]">
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold text-foreground">
        {value ?? '—'}
      </p>
    </div>
  );
}
