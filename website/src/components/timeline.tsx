import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildAgentPrompt } from '@/lib/agent-prompt';
import { cn, shortSha } from '@/lib/utils';
import type { EcosystemCommitRecord } from '@/types';

type CopyStatus = 'copied' | 'failed';

const COPY_LABELS: Record<CopyStatus, string> = {
  copied: 'Copied!',
  failed: 'Copy failed',
};

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

interface InspectPromptButtonProps {
  copyStatus: CopyStatus | null;
  stackLabel: string | null;
  onClick: () => void;
}

const INSPECT_BUTTON_BG = '#2747c5';
const INSPECT_BUTTON_BG_COPIED = '#ffffff';
const INSPECT_BUTTON_TEXT = '#e9e9e9';
const INSPECT_BUTTON_BORDER = '#6387e3';

function InspectPromptButton({
  copyStatus,
  stackLabel,
  onClick,
}: InspectPromptButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const isCopied = copyStatus === 'copied';

  useLayoutEffect(() => {
    if (!isCopied) {
      setTooltipPos(null);
      return;
    }
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = { top: rect.top, left: rect.left + rect.width / 2 };
      // Diff numerically — without this, every scroll tick allocates a
      // fresh object and re-renders the portal, defeating React's bail-out.
      setTooltipPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left ? prev : next,
      );
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isCopied]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        className="relative inline-flex w-[104px] items-center justify-center overflow-hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-200 sm:w-[110px] sm:px-2.5"
        style={{ color: isCopied ? INSPECT_BUTTON_BG : INSPECT_BUTTON_TEXT }}
        title="Copy a prompt to paste into an AI agent to diagnose this failure"
      >
        <span
          aria-hidden
          className="absolute inset-0 transition-colors duration-200"
          style={{
            backgroundColor: isCopied
              ? INSPECT_BUTTON_BG_COPIED
              : INSPECT_BUTTON_BG,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-dashed transition-colors duration-200"
          style={{
            borderColor: isCopied
              ? INSPECT_BUTTON_BG_COPIED
              : INSPECT_BUTTON_BORDER,
          }}
        />
        <span className="relative">
          {copyStatus ? COPY_LABELS[copyStatus] : 'Inspect prompt'}
        </span>
      </button>
      {isCopied && stackLabel && tooltipPos
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border/60 bg-black/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg"
              style={{ top: tooltipPos.top - 8, left: tooltipPos.left }}
            >
              Paste the prompt to agent within {stackLabel} to inspect
              <span
                aria-hidden
                className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border/60 bg-black/95"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

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
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Timeline({
  entries,
  selectedSuite: externalSelectedSuite,
  onSuiteChange,
  stacks,
  selectedStack: externalSelectedStack,
  onStackChange,
  searchQuery: externalSearchQuery,
  onSearchChange,
}: TimelineProps) {
  const [internalSelectedSuite, setInternalSelectedSuite] =
    useState<string>('all');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [copyState, setCopyState] = useState<{
    sha: string;
    status: CopyStatus;
  } | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleCopyPrompt = useCallback(
    async (entry: EcosystemCommitRecord) => {
      if (!externalSelectedStack) return;
      // When a suite filter is active, `entry` comes from `suiteFilteredEntries`
      // with a narrowed `suites` array — look up the unfiltered record by SHA
      // so the prompt reflects every failing suite on the commit.
      const fullEntry =
        entries.find((e) => e.commitSha === entry.commitSha) ?? entry;
      const prompt = buildAgentPrompt({
        entry: fullEntry,
        stackId: externalSelectedStack,
        history: entries,
      });

      const setState = (status: CopyStatus) => {
        setCopyState({ sha: entry.commitSha, status });
        if (copyTimerRef.current != null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => {
          setCopyState(null);
          copyTimerRef.current = null;
        }, 2000);
      };

      try {
        await navigator.clipboard.writeText(prompt);
        setState('copied');
        return;
      } catch {
        // Fall through to legacy execCommand path (headless / non-secure contexts).
      }

      try {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        setState(ok ? 'copied' : 'failed');
      } catch {
        setState('failed');
      }
    },
    [entries, externalSelectedStack],
  );

  const selectedSuite = externalSelectedSuite ?? internalSelectedSuite;
  const setSelectedSuite = onSuiteChange ?? setInternalSelectedSuite;
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const setSearchQuery = onSearchChange ?? setInternalSearchQuery;

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  const allSuiteNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) {
      for (const suite of entry.suites) {
        names.add(suite.name);
      }
    }
    return Array.from(names).sort();
  }, [entries]);

  const suiteFilteredEntries = useMemo(() => {
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

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return suiteFilteredEntries;
    }
    return suiteFilteredEntries.filter(
      (entry) =>
        entry.commitMessage.toLowerCase().includes(q) ||
        entry.commitSha.toLowerCase().includes(q) ||
        entry.author?.name?.toLowerCase().includes(q) ||
        entry.author?.login?.toLowerCase().includes(q) ||
        entry.suites.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [suiteFilteredEntries, searchQuery]);

  const selectedStackMeta = useMemo(() => {
    if (!stacks?.length || !externalSelectedStack) {
      return null;
    }
    return stacks.find((stack) => stack.id === externalSelectedStack) ?? null;
  }, [stacks, externalSelectedStack]);

  const hasStackControl =
    Boolean(stacks?.length) && typeof onStackChange === 'function';

  const virtualizer = useWindowVirtualizer({
    count: filteredEntries.length,
    estimateSize: () => 180,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const renderEntry = useCallback(
    (entry: EcosystemCommitRecord, index: number) => {
      const commitStyles =
        commitStatusStyles[entry.overallStatus] ?? commitStatusStyles.failure;
      const formattedDate = formatter.format(new Date(entry.commitTimestamp));
      const sha = shortSha(entry.commitSha);
      const commitUrl = `https://github.com/${entry.repository.fullName}/commit/${entry.commitSha}`;
      const isFirst = index === 0;
      const isLast = index === filteredEntries.length - 1;
      const stackLabel = selectedStackMeta?.label;
      const isRenovateBot = entry.author?.login === 'renovate[bot]';
      const avatarUrl = isRenovateBot
        ? 'https://avatars.githubusercontent.com/in/2740?s=80&v=4'
        : (entry.author?.avatarUrl ??
          (entry.author?.login
            ? `https://github.com/${entry.author.login}.png`
            : null));

      return (
        <div className="grid min-w-0 grid-cols-[26px,1fr] items-stretch gap-3 sm:grid-cols-[30px,1fr] sm:gap-5">
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
                  'h-3.5 w-3.5 rounded-full motion-safe:animate-[glow-pulse_2s_ease-in-out_infinite]',
                  commitStyles.dotCore,
                )}
              />
            </span>
            <span
              aria-hidden
              className={cn(
                'w-px',
                isLast ? 'h-3 flex-none bg-transparent' : 'flex-1 bg-border/50',
              )}
            />
          </div>

          <Card className="border border-border/50">
            <CardHeader className="flex flex-row items-center gap-3 border-b border-border/40 p-2.5 sm:gap-4 sm:p-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={entry.author?.name ?? 'Author'}
                  width="32"
                  height="32"
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
                      className="inline-flex items-center gap-2 text-foreground transition-[color] hover:text-foreground/70"
                    >
                      <span className="truncate">{entry.commitMessage}</span>
                      <span className="flex-none text-sm text-muted-foreground">
                        ↗
                      </span>
                    </a>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                    <a
                      className="inline-flex items-center gap-1 rounded border border-border/50 bg-black/40 px-2 py-0.5 font-mono tracking-tight text-foreground/85 transition-[border-color,color] hover:border-border hover:text-foreground"
                      href={commitUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sha}
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
                  <div className="flex items-center gap-2">
                    {entry.overallStatus === 'failure' ? (
                      <InspectPromptButton
                        copyStatus={
                          copyState?.sha === entry.commitSha
                            ? copyState.status
                            : null
                        }
                        stackLabel={stackLabel ?? null}
                        onClick={() => handleCopyPrompt(entry)}
                      />
                    ) : null}
                    <Badge
                      variant={commitStyles.badge}
                      className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:px-2.5"
                    >
                      {commitStyles.label}
                    </Badge>
                  </div>
                  <a
                    href={entry.workflowRunUrl}
                    className="text-[11px] text-muted-foreground transition-[color] hover:text-foreground/90"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View workflow ↗
                  </a>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-2.5 sm:p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                          'flex min-w-0 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color] hover:border-border hover:bg-black/15',
                          suiteStyles.container,
                        )}
                      >
                        <span className="truncate text-foreground/90">
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
    },
    [
      filteredEntries.length,
      formatter,
      handleCopyPrompt,
      copyState,
      selectedStackMeta,
    ],
  );

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {hasStackControl ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              Stack:
            </span>
            <Select
              value={externalSelectedStack}
              onValueChange={(value) => onStackChange?.(value)}
            >
              <SelectTrigger
                className="min-w-0 flex-1"
                aria-label="Select stack"
              >
                <SelectValue placeholder="Select stack…">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground/90">
                      {selectedStackMeta?.label ?? 'Select stack'}
                    </span>
                    {selectedStackMeta ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-transparent text-[11px]"
                      >
                        {selectedStackMeta.runs}{' '}
                        {selectedStackMeta.runs === 1 ? 'run' : 'runs'}
                      </Badge>
                    ) : null}
                  </span>
                </SelectValue>
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

        <div className="flex min-w-0 items-center gap-3">
          <label
            htmlFor="suite-filter"
            className="shrink-0 text-sm font-medium text-muted-foreground"
          >
            Filter:
          </label>
          <Select value={selectedSuite} onValueChange={setSelectedSuite}>
            <SelectTrigger id="suite-filter" className="min-w-0 flex-1">
              <SelectValue placeholder="Select suite…">
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

        <div className="flex min-w-0 items-center gap-3">
          <label
            htmlFor="commit-search"
            className="shrink-0 text-sm font-medium text-muted-foreground"
          >
            Search:
          </label>
          <input
            id="commit-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Commit, author, suite…"
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-[border-color,box-shadow] focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30"
          />
        </div>
      </div>

      {filteredEntries.length > 0 ? (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
            }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = filteredEntries[virtualRow.index];
              return (
                <div
                  key={entry.commitSha}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="pb-3"
                >
                  {renderEntry(entry, virtualRow.index)}
                </div>
              );
            })}
          </div>
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
