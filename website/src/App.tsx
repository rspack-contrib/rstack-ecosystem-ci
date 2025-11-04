import { useEffect, useMemo, useRef, useState } from 'react';

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
  { id: 'rsdoctor', label: 'Rsdoctor' },
  { id: 'rslint', label: 'Rslint' },
] as const;

type StackId = (typeof STACKS)[number]['id'];

const DEFAULT_STACK: StackId = 'rspack';

const GITHUB_REPO_URL = 'https://github.com/rspack-contrib/rstack-ecosystem-ci';

const RSTACK_REPOS = [
  { label: 'Rspack', url: 'https://github.com/web-infra-dev/rspack' },
  { label: 'Rsbuild', url: 'https://github.com/web-infra-dev/rsbuild' },
  { label: 'Rslib', url: 'https://github.com/web-infra-dev/rslib' },
  { label: 'Rstest', url: 'https://github.com/web-infra-dev/rstest' },
  { label: 'Rsdoctor', url: 'https://github.com/web-infra-dev/rsdoctor' },
  { label: 'Rslint', url: 'https://github.com/web-infra-dev/rslint' },
] as const;

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

  const [isRepoMenuOpen, setIsRepoMenuOpen] = useState(false);
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
  const repoMenuRef = useRef<HTMLDivElement | null>(null);

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

        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total tracked runs" value={stats.total} />
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
      lastUpdated: null as string | null,
    };
  }

  const total = records.length;
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
