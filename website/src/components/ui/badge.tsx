import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

const baseClasses =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition';

export interface BadgeProps extends ComponentPropsWithoutRef<'div'> {
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'outline';
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        baseClasses,
        variant === 'default' &&
          'border-transparent bg-accent/60 text-foreground',
        variant === 'success' &&
          'border-transparent bg-success/10 text-success-foreground',
        variant === 'destructive' &&
          'border-transparent bg-destructive/20 text-destructive-foreground',
        variant === 'warning' &&
          'border-transparent bg-warning/20 text-warning-foreground',
        variant === 'outline' && 'border-border/60 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
