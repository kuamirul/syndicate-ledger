import { Flag, RotateCcw, Search, Shuffle, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';
import { selectMatchSummary, type OutcomeTone } from '../matchSummary';
import { SUMMARY_TERMS, TERMS } from '../terms';
import { PLAYER_ID } from '../viewModel';
import { money } from './format';

const TONE_VARIANT: Record<OutcomeTone, 'success' | 'destructive' | 'secondary'> = {
  win: 'success',
  out: 'destructive',
  neutral: 'secondary',
};

export function MatchSummaryDialog() {
  const game = useGameStore((s) => s.gameState);
  const seed = useGameStore((s) => s.seed);
  const dismissed = useGameStore((s) => s.summaryDismissed);
  const dismiss = useGameStore((s) => s.dismissSummary);
  const startRandom = useGameStore((s) => s.startRandomGame);
  const startNew = useGameStore((s) => s.startNewGame);

  const summary = selectMatchSummary(game, PLAYER_ID);
  if (!summary) return null;
  const victory = summary.result === 'victory';

  return (
    <Dialog open={!dismissed} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent
        className="max-w-5xl"
        // Focus the dialog itself, not a button: the Space press that ended the last week must not
        // be released onto "Inspect Final Board" and dismiss the summary the instant it opens.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            {victory ? (
              <Trophy className="size-6 text-amber-400" aria-hidden />
            ) : (
              <Flag className="size-6 text-rose-400" aria-hidden />
            )}
            <span className={victory ? 'text-amber-400' : 'text-rose-400'}>{summary.title}</span>
            <Badge variant="outline">Week {summary.week}</Badge>
          </DialogTitle>
          <DialogDescription>
            {summary.ended === 'playerOut' ? SUMMARY_TERMS.eliminatedNote : SUMMARY_TERMS.boardNote}
          </DialogDescription>
        </DialogHeader>

        <p
          className={cn(
            'mb-3 rounded-lg border px-3 py-2 text-sm',
            victory ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          )}
        >
          <span className="font-semibold">{SUMMARY_TERMS.decisive}: </span>
          {summary.decisiveFactor}
        </p>

        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-0">
              <TableHead className="px-1.5">Rank</TableHead>
              <TableHead className="px-1.5">Syndicate</TableHead>
              <TableHead className="px-1.5 text-right">Businesses</TableHead>
              <TableHead className="px-1.5 text-right">{TERMS.streetCash.label}</TableHead>
              <TableHead className="px-1.5 text-right">Safe Cash (×2 Score)</TableHead>
              <TableHead className="px-1.5 text-right">Businesses Value</TableHead>
              <TableHead className="px-1.5 text-right">Total Net Worth</TableHead>
              <TableHead className="px-1.5">Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.standings.map((r) => (
              <TableRow key={r.id} className={cn(r.isPlayer && 'bg-zinc-800/60')}>
                <TableCell className="px-1.5">#{r.rank}</TableCell>
                <TableCell className="px-1.5 font-medium">
                  {r.isPlayer ? 'You' : r.name}
                  {r.archetypeLabel && <span className="block font-normal text-zinc-400">{r.archetypeLabel}</span>}
                </TableCell>
                <TableCell className="px-1.5 text-right">{r.businesses}</TableCell>
                <TableCell className="px-1.5 text-right">{money(r.streetCash)}</TableCell>
                <TableCell className="px-1.5 text-right">
                  {money(r.safeCash)}
                  <span className="block text-zinc-400">= {money(r.safeCashScore)}</span>
                </TableCell>
                <TableCell className="px-1.5 text-right">{money(r.businessesValue)}</TableCell>
                <TableCell className="px-1.5 text-right font-semibold text-amber-400">{money(r.netWorth)}</TableCell>
                <TableCell className="px-1.5">
                  <Badge variant={TONE_VARIANT[r.tone]} className="whitespace-normal">
                    {r.outcome}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={dismiss}>
            <Search className="size-4" aria-hidden />
            {SUMMARY_TERMS.inspect}
          </Button>
          <Button variant="outline" onClick={() => startNew(seed)}>
            <RotateCcw className="size-4" aria-hidden />
            {SUMMARY_TERMS.retrySeed(seed)}
          </Button>
          <Button className="bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={startRandom}>
            <Shuffle className="size-4" aria-hidden />
            {SUMMARY_TERMS.newRun}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
