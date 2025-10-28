import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { EcosystemCommitRecord } from '@/types';

const commitStatusStyles = {
  success: {
    dotRing: 'border-emerald-400/70',
    dotCore: 'bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.85)]',
    badge: 'success' as const,
    label: 'Passed',
  },
  failure: {
    dotRing: 'border-rose-500/80',
    dotCore: 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.85)]',
    badge: 'destructive' as const,
    label: 'Failed',
  },
  cancelled: {
    dotRing: 'border-amber-400/90',
    dotCore: 'bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)]',
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
}

export function Timeline({ entries }: TimelineProps) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  if (!entries?.length) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-8 py-16 text-center text-muted-foreground shadow-inner">
        <p className="text-sm">
          No history yet. New commits will appear here once ecosystem CI runs.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry, index) => {
        const commitStyles =
          commitStatusStyles[entry.overallStatus] ?? commitStatusStyles.failure;
        const formattedDate = formatter.format(new Date(entry.commitTimestamp));
        const shortSha = entry.commitSha.slice(0, 7);
        const commitUrl = `https://github.com/${entry.repository.fullName}/commit/${entry.commitSha}`;
        const isFirst = index === 0;
        const isLast = index === entries.length - 1;

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
              <CardHeader className="flex flex-col gap-3 border-b border-border/40 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="space-y-2">
                  <CardTitle className="text-base font-semibold text-foreground sm:text-lg">
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-foreground transition hover:text-foreground/70"
                    >
                      {entry.commitMessage}
                      <span className="text-sm text-muted-foreground">↗</span>
                    </a>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                    <a
                      className="inline-flex items-center gap-1 rounded border border-border/50 bg-black/40 px-2.5 py-0.5 font-mono tracking-tight text-foreground/85 transition hover:border-border hover:text-foreground"
                      href={commitUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortSha}
                      <span className="text-[10px] text-muted-foreground/80">
                        ↗
                      </span>
                    </a>
                    <span className="flex items-center gap-1 text-foreground/80">
                      <span className="opacity-70">by</span>
                      <span>
                        {entry.author?.name ??
                          entry.author?.login ??
                          'Unknown author'}
                        {entry.author?.login && entry.author?.name
                          ? ` (${entry.author.login})`
                          : ''}
                      </span>
                    </span>
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

                <div className="flex flex-col items-end gap-1 text-right text-xs">
                  <Badge
                    variant={commitStyles.badge}
                    className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
                  >
                    {commitStyles.label}
                  </Badge>
                  <a
                    href={entry.workflowRunUrl}
                    className="text-xs text-muted-foreground transition hover:text-foreground/90"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View workflow ↗
                  </a>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">
                    Suites
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {entry.suites.map((suite) => {
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
                            'flex min-w-[12rem] flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium transition hover:border-border hover:bg-black/15',
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
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
