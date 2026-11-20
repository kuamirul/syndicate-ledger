import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-zinc-50 text-zinc-900',
        secondary: 'border-transparent bg-zinc-800 text-zinc-200',
        outline: 'border-zinc-700 text-zinc-300',
        destructive: 'border-transparent bg-rose-600 text-white',
        success: 'border-transparent bg-emerald-600/20 text-emerald-400',
        warning: 'border-transparent bg-amber-500/20 text-amber-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
