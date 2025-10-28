import { useMemo, useState } from 'react';

import { Timeline } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import mockHistory from '@/data/mock-history';
import remoteHistory from '@/data/remote-history';
import type { EcosystemCommitHistory, EcosystemCommitRecord } from '@/types';

const STACKS = [
  { id: 'rsbuild', label: 'Rsbuild' },
  { id: 'rspack', label: 'Rspack' },
  { id: 'rslib', label: 'Rslib' },
  { id: 'rstest', label: 'Rstest' },
] as const;

type StackId = (typeof STACKS)[number]['id'];

const DEFAULT_STACK: StackId = 'rspack';

const DATA_SOURCE =
  import.meta.env.RSBUILD_PUBLIC_DATA_SOURCE === 'mock' ? 'mock' : 'remote';

export default function App() {
  const historySource = (
    DATA_SOURCE === 'mock' ? mockHistory : remoteHistory
  ) as Record<StackId, EcosystemCommitHistory>;

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

  const defaultStack =
    (historyByStack[DEFAULT_STACK]?.length ?? 0) ? DEFAULT_STACK : STACKS[0].id;

  const [selectedStack, setSelectedStack] = useState<StackId>(defaultStack);

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
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-black/50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground/80">
              Ecosystem CI
              {DATA_SOURCE === 'mock' ? (
                <Badge
                  variant="outline"
                  className="border-border/50 bg-black/40 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.3em]"
                >
                  Mock Data
                </Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Rstack main branch health dashboard
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Inspect the latest ecosystem CI verdicts for each Rstack project.
              Switch stacks to follow commit-by-commit health, view workflow
              logs, and spot failing suites before they escalate.
            </p>
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

        <Timeline entries={stackEntries} />
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
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(records[0].commitTimestamp))
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
      <p className="mt-3 text-2xl font-semibold text-foreground">
        {value ?? '—'}
      </p>
    </div>
  );
}
