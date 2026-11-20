import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TERMS } from '../terms';
import { money, signedMoney } from './format';
import type { SundayProjection } from '@/store/selectors';

export function ForecastPopover({ projection }: { projection: SundayProjection }) {
  const bad = projection.forcedSaleRisk;
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-1 rounded px-1 text-xs tabular-nums hover:bg-zinc-800',
          projection.net < 0 || bad ? 'text-rose-400' : 'text-zinc-300'
        )}
      >
        <span className="text-zinc-400">Sunday Net Forecast</span>
        <span className="font-semibold">{signedMoney(projection.net)}</span>
        {bad && <span className="font-bold text-rose-400">[FORCED SALE RISK]</span>}
        <Info className="size-3 text-zinc-500" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="space-y-1 tabular-nums">
        <p className="font-semibold">Sunday Net Forecast</p>
        <Row label="+ Business Income (incl. District Bonus)" value={signedMoney(projection.income)} tone="up" />
        <Row label="− Crew Payroll" value={`-${money(projection.crewPayroll)}`} tone="down" />
        <Row label={`− ${TERMS.sizeTax.label}`} value={`-${money(projection.sizeTax)}`} tone="down" />
        <div className="border-t border-zinc-700 pt-1">
          <Row label="Net" value={signedMoney(projection.net)} tone={projection.net < 0 ? 'down' : 'up'} />
          <Row label="Street Cash after Sunday" value={money(projection.projectedStreet)} />
          <Row label="Safe Cash after Sunday" value={money(projection.projectedSafe)} />
        </div>
        {bad && (
          <p className="text-rose-400">You would owe more than you hold: your cheapest business is sold at 50% value.</p>
        )}
        <p className="text-xs text-zinc-500">Excludes random Police Raids and anything you do before Sunday.</p>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <span className={cn(tone === 'up' && 'text-emerald-400', tone === 'down' && 'text-rose-400')}>{value}</span>
    </div>
  );
}
