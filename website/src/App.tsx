import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Timeline } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  { id: 'rsdoctor', label: 'Rsdoctor' },
  { id: 'rspress', label: 'Rspress' },
] as const;

type StackId = (typeof STACKS)[number]['id'];
type StackStatus = EcosystemCommitRecord['overallStatus'] | 'missing';

const DEFAULT_STACK: StackId = 'rspack';

const GITHUB_REPO_URL = 'https://github.com/rspack-contrib/rstack-ecosystem-ci';

const RSTACK_REPOS = [
  { label: 'Rspack', url: 'https://github.com/web-infra-dev/rspack' },
  { label: 'Rsbuild', url: 'https://github.com/web-infra-dev/rsbuild' },
  { label: 'Rslib', url: 'https://github.com/web-infra-dev/rslib' },
  { label: 'Rstest', url: 'https://github.com/web-infra-dev/rstest' },
  { label: 'Rsdoctor', url: 'https://github.com/web-infra-dev/rsdoctor' },
  { label: 'Rspress', url: 'https://github.com/web-infra-dev/rspress' },
] as const;

const RSPRESS_PREVIEW_LINKS: Array<{
  id: StackId;
  label: string;
  url: string;
}> = [
  {
    id: 'rspack',
    label: 'Rspack',
    url: 'https://ecosystem-ci--rspack.netlify.app/',
  },
  {
    id: 'rsbuild',
    label: 'Rsbuild',
    url: 'https://ecosystem-ci--rsbuild.netlify.app/',
  },
  {
    id: 'rslib',
    label: 'Rslib',
    url: 'https://ecosystem-ci--rslib.netlify.app/',
  },
  {
    id: 'rstest',
    label: 'Rstest',
    url: 'https://ecosystem-ci--rstest-dev.netlify.app/',
  },
];

export default function App() {
  const historySource = history as Record<StackId, EcosystemCommitHistory>;
  const [searchParams, setSearchParams] = useSearchParams();

  const [isRepoMenuOpen, setIsRepoMenuOpen] = useState(false);
  const repoMenuRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  const selectedStackParam = searchParams.get('stack') as StackId | null;
  const hasValidStack =
    selectedStackParam != null &&
    STACKS.some((stack) => stack.id === selectedStackParam);
  const selectedStack: StackId = hasValidStack
    ? selectedStackParam
    : DEFAULT_STACK;

  const selectedSuite = searchParams.get('suite') ?? 'all';

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

  useEffect(() => {
    if (!hasValidStack) {
      const params = new URLSearchParams(searchParams);
      params.set('stack', DEFAULT_STACK);
      if ((params.get('suite') ?? 'all') === 'all') {
        params.delete('suite');
      }
      setSearchParams(params, { replace: true });
    }
  }, [hasValidStack, searchParams, setSearchParams]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isRepoMenuOpen) {
      return;
    }

    function handleClick(event: MouseEvent) {
      if (!repoMenuRef.current?.contains(event.target as Node)) {
        setIsRepoMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsRepoMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isRepoMenuOpen]);

  const handleStackChange = useCallback(
    (nextStack: StackId) => {
      if (nextStack === selectedStack) {
        return;
      }
      const params = new URLSearchParams(searchParams);
      params.set('stack', nextStack);
      setSearchParams(params);
    },
    [searchParams, selectedStack, setSearchParams],
  );

  const handleSuiteChange = useCallback(
    (suite: string) => {
      const params = new URLSearchParams(searchParams);
      if (!params.get('stack')) {
        params.set('stack', selectedStack);
      }
      if (!suite || suite === 'all') {
        params.delete('suite');
      } else {
        params.set('suite', suite);
      }
      setSearchParams(params);
    },
    [searchParams, selectedStack, setSearchParams],
  );

  const stackEntries = historyByStack[selectedStack] ?? [];
  const stackStatusSummary = useMemo(
    () => buildStackStatuses(historyByStack),
    [historyByStack],
  );
  const stackOptions = useMemo(
    () =>
      STACKS.map((stack) => ({
        id: stack.id,
        label: stack.label,
        runs: historyByStack[stack.id]?.length ?? 0,
      })),
    [historyByStack],
  );
  const schedule = useMemo(() => buildUpdateSchedule(now), [now]);

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
          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center justify-end gap-2">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Open GitHub repository"
              >
                <span className="sr-only">GitHub</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="currentColor"
                  role="img"
                >
                  <title>GitHub</title>
                  <path d="M12 0C5.37 0 0 5.48 0 12.24c0 5.41 3.44 9.99 8.2 11.61.6.12.82-.27.82-.59 0-.29-.01-1.05-.02-2.05-3.34.75-4.04-1.65-4.04-1.65-.55-1.43-1.35-1.81-1.35-1.81-1.1-.77.08-.75.08-.75 1.22.09 1.86 1.28 1.86 1.28 1.08 1.9 2.83 1.35 3.52 1.03.11-.81.42-1.35.76-1.66-2.67-.31-5.47-1.37-5.47-6.12 0-1.35.47-2.45 1.24-3.31-.13-.31-.54-1.56.12-3.26 0 0 1-.33 3.3 1.26a11.1 11.1 0 0 1 3-.41c1.02 0 2.05.14 3 .41 2.3-1.59 3.3-1.26 3.3-1.26.66 1.7.25 2.95.12 3.26.77.86 1.24 1.96 1.24 3.31 0 4.76-2.8 5.8-5.48 6.11.43.39.81 1.17.81 2.36 0 1.7-.02 3.07-.02 3.48 0 .32.22.71.82.59C20.56 22.23 24 17.65 24 12.24 24 5.48 18.63 0 12 0Z" />
                </svg>
              </a>

              <div className="relative" ref={repoMenuRef}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 hover:text-white"
                  aria-haspopup="menu"
                  aria-expanded={isRepoMenuOpen}
                  onClick={() => setIsRepoMenuOpen((open) => !open)}
                >
                  Rstack
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className={`h-3 w-3 transition-transform ${isRepoMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    role="img"
                  >
                    <title>Toggle menu</title>
                    <path
                      d="M2.2 4.2 6 8l3.8-3.8"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {isRepoMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-border/40 bg-black/90 p-1.5 shadow-lg backdrop-blur">
                    <ul className="flex flex-col gap-1">
                      {RSTACK_REPOS.map((repo) => (
                        <li key={repo.url}>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md px-2.5 py-1.5 text-sm text-foreground/85 transition hover:bg-white/10 hover:text-white"
                            onClick={() => setIsRepoMenuOpen(false)}
                          >
                            {repo.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <StackStatusCard
            statuses={stackStatusSummary}
            activeStack={selectedStack}
            onSelect={handleStackChange}
          />
          <UpdateScheduleCard
            lastUpdated={schedule.lastUpdated}
            countdownMinutes={schedule.countdownMinutes}
          />
        </section>

        <Timeline
          entries={stackEntries}
          stacks={stackOptions}
          selectedStack={selectedStack}
          onStackChange={(value) => handleStackChange(value as StackId)}
          selectedSuite={selectedSuite}
          onSuiteChange={handleSuiteChange}
          previewLinks={RSPRESS_PREVIEW_LINKS}
        />
      </div>
    </div>
  );
}

interface StackStatusSummary {
  id: StackId;
  label: string;
  status: StackStatus;
}

function buildStackStatuses(
  historyByStack: Record<StackId, EcosystemCommitHistory>,
) {
  return STACKS.map((stack) => {
    const records = historyByStack[stack.id] ?? [];
    const latest = records[0] ?? null;

    return {
      id: stack.id,
      label: stack.label,
      status: latest?.overallStatus ?? 'missing',
    };
  });
}

interface UpdateSchedule {
  lastUpdated: string | null;
  countdownMinutes: number | null;
}

function buildUpdateSchedule(referenceTime: Date): UpdateSchedule {
  const lastUpdate = alignToHour(referenceTime, 'floor');
  const nextUpdate = alignToHour(referenceTime, 'ceil');

  const countdownMinutes = Math.max(
    0,
    Math.floor((nextUpdate.getTime() - referenceTime.getTime()) / 60_000),
  );

  return {
    lastUpdated: formatTimestamp(lastUpdate),
    countdownMinutes,
  };
}

function formatTimestamp(date: Date) {
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
}

function alignToHour(date: Date, mode: 'floor' | 'ceil') {
  const aligned = new Date(date);
  aligned.setSeconds(0, 0);
  aligned.setMinutes(0);

  if (mode === 'floor' && aligned.getTime() > date.getTime()) {
    aligned.setHours(aligned.getHours() - 1);
  } else if (mode === 'ceil' && aligned.getTime() <= date.getTime()) {
    aligned.setHours(aligned.getHours() + 1);
  }

  return aligned;
}

function formatCountdown(minutes: number | null) {
  if (minutes == null) {
    return null;
  }

  const safeMinutes = Math.max(0, minutes);
  return `in ${safeMinutes}min`;
}

const STACK_STATUS_CLASS: Record<StackStatus, string> = {
  success: 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.55)]',
  failure: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]',
  cancelled: 'bg-amber-400 shadow-[0_0_12px_rgba(250,204,21,0.5)]',
  missing: 'bg-white/60 shadow-[0_0_10px_rgba(255,255,255,0.35)]',
};
interface StackStatusCardProps {
  statuses: StackStatusSummary[];
  activeStack: StackId;
  onSelect?: (stack: StackId) => void;
}

function StackStatusCard({
  statuses,
  activeStack,
  onSelect,
}: StackStatusCardProps) {
  return (
    <div className="glass-panel rounded-2xl border border-border/60 px-6 py-5 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.65)]">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">
          Stack Health
        </p>
        <span className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/55">
          Latest run
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statuses.map((stack) => {
          const isActive = stack.id === activeStack;
          const baseClasses =
            'flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30';
          return (
            <button
              type="button"
              key={stack.id}
              className={cn(
                baseClasses,
                onSelect ? 'hover:bg-white/[0.08] focus:bg-white/[0.08]' : '',
                isActive ? 'border-white/40 bg-white/[0.08]' : '',
                onSelect ? 'cursor-pointer' : 'cursor-default',
              )}
              onClick={() => onSelect?.(stack.id)}
              aria-pressed={isActive}
            >
              <span className="text-sm font-medium text-foreground">
                {stack.label}
              </span>
              <span
                className={`inline-flex h-3.5 w-3.5 shrink-0 rounded-full ${STACK_STATUS_CLASS[stack.status]}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface UpdateScheduleCardProps {
  lastUpdated: string | null;
  countdownMinutes: number | null;
}

function UpdateScheduleCard({
  lastUpdated,
  countdownMinutes,
}: UpdateScheduleCardProps) {
  const countdownLabel = formatCountdown(countdownMinutes);

  return (
    <div className="glass-panel h-full rounded-2xl border border-border/60 bg-white/[0.03] px-6 py-5 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.65)]">
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">
        Ecosystem CI Window
      </p>
      <div className="mt-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Last updated</p>
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/55">
              Data sync
            </p>
          </div>
          <p className="text-right text-sm text-foreground">
            {lastUpdated ?? '—'}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Next refresh</p>
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/55">
              1h cron
            </p>
          </div>
          <p className="text-right text-sm text-foreground">
            {countdownLabel ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
