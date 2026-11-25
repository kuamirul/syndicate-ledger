import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DecisionRow, RivalIntel } from '../rivalsModel';

interface Props {
  rival: RivalIntel | null;
  onOpenChange: (open: boolean) => void;
}

const WEIGHT_LABELS = [
  ['greed', 'Greed'],
  ['aggression', 'Aggression'],
  ['caution', 'Caution'],
  ['revenge', 'Revenge'],
] as const;

function num(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}

/** Score breakdown for one decision: each term x archetype weight, then Emergency / Coalition, then Total. */
function DecisionTable({ row }: { row: DecisionRow }) {
  const clamped = row.emergency <= -900;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <p className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{row.label}</span>
        <span className="tabular-nums text-amber-400">Total {row.total}</span>
      </p>
      <Table>
        <TableHeader>
          <TableRow className="border-0">
            <TableHead>Term</TableHead>
            <TableHead className="text-right">Raw</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead className="text-right">Adds</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {row.rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-right">{r.raw}</TableCell>
              <TableCell className="text-right">{r.weight === null ? '—' : `×${r.weight}`}</TableCell>
              <TableCell className="text-right">{num(r.contribution)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>Emergency</TableCell>
            <TableCell className="text-right">{row.emergency}</TableCell>
            <TableCell className="text-right">—</TableCell>
            <TableCell className="text-right">{num(row.emergency)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Anti-Leader bonus</TableCell>
            <TableCell className="text-right">{row.coalition}</TableCell>
            <TableCell className="text-right">—</TableCell>
            <TableCell className="text-right">{num(row.coalition)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {clamped && <p className="mt-1 text-xs text-amber-400">Emergency −999 means a hard cash-safety clamp: total is forced to −999.</p>}
      <p className="mt-1 text-xs text-zinc-400">{row.reasoning}</p>
    </div>
  );
}

export function AiDecisionSheet({ rival, onOpenChange }: Props) {
  const intel = rival?.intel ?? null;
  return (
    <Sheet open={!!rival && !!intel} onOpenChange={onOpenChange}>
      <SheetContent>
        {rival && intel && (
          <>
            <SheetHeader>
              <SheetTitle>
                {rival.name}: AI Decision Math
              </SheetTitle>
              <SheetDescription>
                TotalScore = Earnings×Greed + Turf×Aggression − Heat Risk×Caution + Grudge×Revenge + Emergency + Anti-Leader.
                The rival plays by the same rules as you; only its scoring is shown here.
              </SheetDescription>
            </SheetHeader>

            <section aria-label="Archetype weights">
              <h3 className="mb-1 text-sm font-semibold text-zinc-300">
                {rival.archetypeLabel} <span className="font-normal text-zinc-400">— {rival.tag}</span>
              </h3>
              <dl className="grid grid-cols-4 gap-2 text-xs tabular-nums">
                {WEIGHT_LABELS.map(([key, label]) => (
                  <div key={key} className="rounded border border-zinc-800 bg-zinc-950 p-1.5">
                    <dt className="text-zinc-500">{label}</dt>
                    <dd className="text-sm font-semibold">{intel.weights ? intel.weights[key] : '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-label="Last turn">
              <h3 className="mb-1 text-sm font-semibold text-zinc-300">
                {intel.lastTurnWeek === null ? 'Last turn' : `Last turn (Week ${intel.lastTurnWeek}): what it chose`}
              </h3>
              {intel.lastTurn.length === 0 ? (
                <p className="text-xs text-zinc-400">No moves logged yet. End a week to see the first decisions.</p>
              ) : (
                <div className="space-y-2">
                  {intel.lastTurn.map((r, i) => (
                    <DecisionTable key={i} row={r} />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Next turn top three">
              <h3 className="mb-1 text-sm font-semibold text-zinc-300">Next turn: top 3 if the week ended now</h3>
              <p className="mb-1 text-xs text-zinc-400">
                Live ranking from current state; earlier moves or Sunday results can change it.
              </p>
              <div className="space-y-2">
                {intel.nextTop3.map((r, i) => (
                  <DecisionTable key={i} row={r} />
                ))}
              </div>
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
