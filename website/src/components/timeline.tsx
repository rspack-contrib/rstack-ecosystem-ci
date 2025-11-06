import { useMemo, useState } from 'react';

import netlifyLogomark from '@/assets/netlify-symbol.svg';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { EcosystemCommitRecord } from '@/types';

const commitStatusStyles = {
  success: {
    dotRing: 'border-emerald-400/70',
    dotCore: 'bg-emerald-400 shadow-[0_0_24px_6px_rgba(16,185,129,0.6)]',
    badge: 'success' as const,
    label: 'Passed',
  },
  failure: {
    dotRing: 'border-rose-500/80',
    dotCore: 'bg-rose-500 shadow-[0_0_24px_6px_rgba(244,63,94,0.6)]',
    badge: 'destructive' as const,
    label: 'Failed',
  },
  cancelled: {
    dotRing: 'border-amber-400/90',
    dotCore: 'bg-amber-400 shadow-[0_0_24px_6px_rgba(251,191,36,0.55)]',
    badge: 'warning' as const,
    label: 'Cancelled',
  },
} as const;

const suiteStatusStyles = {
  success: {
    container: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
    badge: 'success' as const,
    label: 'Passed',
  },
  failure: {
    container: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
    badge: 'destructive' as const,
    label: 'Failed',
  },
  cancelled: {
    container: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
    badge: 'warning' as const,
    label: 'Skipped',
  },
} as const;

interface TimelineProps {
  entries: EcosystemCommitRecord[];
  selectedSuite?: string;
  onSuiteChange?: (suite: string) => void;
  stacks?: Array<{
    id: string;
    label: string;
    runs: number;
  }>;
  selectedStack?: string;
  onStackChange?: (stackId: string) => void;
  previewLinks?: Array<{ id: string; label: string; url: string }>;
}

export function Timeline({
  entries,
  selectedSuite: externalSelectedSuite,
  onSuiteChange,
  stacks,
  selectedStack: externalSelectedStack,
  onStackChange,
  previewLinks,
}: TimelineProps) {
  const [internalSelectedSuite, setInternalSelectedSuite] =
    useState<string>('all');

  // Use external state if provided, otherwise use internal state
  const selectedSuite = externalSelectedSuite ?? internalSelectedSuite;
  const setSelectedSuite = onSuiteChange ?? setInternalSelectedSuite;

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  // Get all unique suite names
  const allSuiteNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) {
      for (const suite of entry.suites) {
        names.add(suite.name);
      }
    }
    return Array.from(names).sort();
  }, [entries]);

  // Filter entries based on selected suite
  const filteredEntries = useMemo(() => {
    if (selectedSuite === 'all') {
      return entries;
    }
    return entries
      .map((entry) => ({
        ...entry,
        suites: entry.suites.filter((suite) => suite.name === selectedSuite),
      }))
      .filter((entry) => entry.suites.length > 0);
  }, [entries, selectedSuite]);

  const selectedStackMeta = useMemo(() => {
    if (!stacks?.length || !externalSelectedStack) {
      return null;
    }
    return stacks.find((stack) => stack.id === externalSelectedStack) ?? null;
  }, [stacks, externalSelectedStack]);

  const hasStackControl =
    Boolean(stacks?.length) && typeof onStackChange === 'function';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        {hasStackControl ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Stack:
            </span>
            <Select
              value={externalSelectedStack}
              onValueChange={(value) => onStackChange?.(value)}
            >
              <SelectTrigger className="w-52">
                <div className="flex flex-1 items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground/90">
                    {selectedStackMeta?.label ?? 'Select stack'}
                  </span>
                  {selectedStackMeta ? (
                    <Badge
                      variant="outline"
                      className="border-border/40 text-[11px]"
                    >
                      {selectedStackMeta.runs}{' '}
                      {selectedStackMeta.runs === 1 ? 'run' : 'runs'}
                    </Badge>
                  ) : null}
                </div>
                <SelectValue className="sr-only" placeholder="Select stack" />
              </SelectTrigger>
              <SelectContent>
                {stacks?.map((stack) => (
                  <SelectItem key={stack.id} value={stack.id}>
                    <div className="flex w-full items-center justify-between gap-3">
                      <span>{stack.label}</span>
                      <Badge variant="outline">
                        {stack.runs === 0
                          ? 'No runs'
                          : `${stack.runs} ${stack.runs === 1 ? 'run' : 'runs'}`}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <label
            htmlFor="suite-filter"
            className="text-sm font-medium text-muted-foreground"
          >
            Filter by suite:
          </label>
          <Select value={selectedSuite} onValueChange={setSelectedSuite}>
            <SelectTrigger id="suite-filter" className="w-64">
              <SelectValue placeholder="Select suite">
                {selectedSuite === 'all' ? 'All suites' : selectedSuite}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suites</SelectItem>
              {allSuiteNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {externalSelectedStack === 'rspress' && previewLinks?.length ? (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground/65">
            rspress ecosystem ci preview
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {previewLinks.map((preview) => (
              <a
                key={preview.id}
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground transition hover:border-white/35 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
              >
                <img
                  src={netlifyLogomark}
                  alt=""
                  className="h-3.5 w-3.5 mr-1"
                  loading="lazy"
                />
                {preview.label}
                <span aria-hidden className="text-xs text-muted-foreground/75">
                  ↗
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {filteredEntries.length > 0 ? (
        <div className="grid gap-3">
          {filteredEntries.map((entry, index) => {
            const commitStyles =
              commitStatusStyles[entry.overallStatus] ??
              commitStatusStyles.failure;
            const formattedDate = formatter.format(
              new Date(entry.commitTimestamp),
            );
            const shortSha = entry.commitSha.slice(0, 7);
            const commitUrl = `https://github.com/${entry.repository.fullName}/commit/${entry.commitSha}`;
            const isFirst = index === 0;
            const isLast = index === filteredEntries.length - 1;
            const isRenovateBot = entry.author?.login === 'renovate[bot]';
            const avatarUrl = isRenovateBot
              ? 'https://avatars.githubusercontent.com/in/2740?s=80&v=4'
              : (entry.author?.avatarUrl ??
                (entry.author?.login
                  ? `https://github.com/${entry.author.login}.png`
                  : null));

            return (
              <div
                key={entry.commitSha}
                className="grid grid-cols-[26px,1fr] items-stretch gap-5 sm:grid-cols-[30px,1fr]"
              >
                <div className="flex h-full flex-col items-center">
                  <span
                    aria-hidden
                    className={cn(
                      'w-px',
                      isFirst
                        ? 'h-3 flex-none bg-transparent'
                        : 'flex-1 bg-border/50',
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border bg-black/90 shadow-[0_0_0_2px_rgba(255,255,255,0.12)] backdrop-blur',
                      commitStyles.dotRing,
                    )}
                    style={{ animation: 'glow-pulse 2s ease-in-out infinite' }}
                  >
                    <span
                      className={cn(
                        'h-3.5 w-3.5 rounded-full',
                        commitStyles.dotCore,
                      )}
                    />
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'w-px',
                      isLast
                        ? 'h-3 flex-none bg-transparent'
                        : 'flex-1 bg-border/50',
                    )}
                  />
                </div>

                <Card className="border border-border/50">
                  <CardHeader className="flex flex-row items-center gap-3 border-b border-border/40 p-2.5 sm:gap-4 sm:p-3">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={entry.author?.name ?? 'Author'}
                        className={cn(
                          'h-8 w-8 flex-none border-2 border-border/40 bg-black/40',
                          isRenovateBot ? 'rounded-[6px]' : 'rounded-full',
                        )}
                      />
                    ) : null}

                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-sm font-semibold text-foreground sm:text-base">
                          <a
                            href={commitUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-foreground transition hover:text-foreground/70"
                          >
                            <span className="truncate">
                              {entry.commitMessage}
                            </span>
                            <span className="flex-none text-sm text-muted-foreground">
                              ↗
                            </span>
                          </a>
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                          <a
                            className="inline-flex items-center gap-1 rounded border border-border/50 bg-black/40 px-2 py-0.5 font-mono tracking-tight text-foreground/85 transition hover:border-border hover:text-foreground"
                            href={commitUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortSha}
                            <span className="text-[10px] text-muted-foreground/80">
                              ↗
                            </span>
                          </a>
                          {entry.author?.name ? (
                            <>
                              <span
                                aria-hidden
                                className="h-1 w-1 rounded-full bg-border/80"
                              />
                              <span className="flex items-center gap-1 text-foreground/80">
                                <span className="opacity-70">by</span>
                                <span className="truncate">
                                  {entry.author.name}
                                  {entry.author.login && entry.author.name
                                    ? ` (${entry.author.login})`
                                    : ''}
                                </span>
                              </span>
                            </>
                          ) : null}
                          <span
                            aria-hidden
                            className="h-1 w-1 rounded-full bg-border/80"
                          />
                          <time
                            className="opacity-70"
                            dateTime={entry.commitTimestamp}
                          >
                            {formattedDate}
                          </time>
                        </div>
                      </div>

                      <div className="flex flex-none items-center gap-2 sm:flex-col sm:items-end">
                        <Badge
                          variant={commitStyles.badge}
                          className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        >
                          {commitStyles.label}
                        </Badge>
                        <a
                          href={entry.workflowRunUrl}
                          className="text-[11px] text-muted-foreground transition hover:text-foreground/90"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View workflow ↗
                        </a>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-2.5 sm:p-3">
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {[...entry.suites]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((suite) => {
                          const suiteStyles =
                            suiteStatusStyles[suite.status] ??
                            suiteStatusStyles.failure;
                          const durationLabel =
                            typeof suite.durationMs === 'number'
                              ? `${Math.round(suite.durationMs / 1000)}s`
                              : null;

                          return (
                            <a
                              key={`${entry.commitSha}-${suite.name}`}
                              href={suite.logUrl ?? entry.workflowRunUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium transition hover:border-border hover:bg-black/15',
                                suiteStyles.container,
                              )}
                            >
                              <span className="text-foreground/90">
                                {suite.name}
                              </span>
                              <span className="flex items-center gap-2 text-muted-foreground/80">
                                <Badge
                                  variant={suiteStyles.badge}
                                  className="px-2 py-0.5 text-[11px]"
                                >
                                  {suiteStyles.label}
                                </Badge>
                                {durationLabel ? (
                                  <span className="text-[11px] text-muted-foreground/65">
                                    {durationLabel}
                                  </span>
                                ) : null}
                              </span>
                            </a>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-8 py-16 text-center text-muted-foreground shadow-inner">
          <p className="text-sm">
            No runs found for this selection. Try switching stack or suite.
          </p>
        </div>
      )}
    </div>
  );
}
