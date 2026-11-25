import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGameStore } from '@/store/gameStore';
import { unspentActions } from '../actionGuard';
import { GUARD_TERMS } from '../terms';
import { PLAYER_ID } from '../viewModel';

/** Confirmation shown when End Week is requested while the player still has a usable action. */
export function UnspentActionDialog() {
  const open = useGameStore((s) => s.endWeekPromptOpen);
  const game = useGameStore((s) => s.gameState);
  const confirm = useGameStore((s) => s.confirmEndWeek);
  const cancel = useGameStore((s) => s.cancelEndWeek);
  const left = unspentActions(game, PLAYER_ID);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-w-md">
        {/* Body unmounts with the dialog, so the checkbox resets on every open. Keep Playing holds initial
            focus: a Space key-up from the press that opened this must never confirm. */}
        <Body left={left} onConfirm={confirm} onCancel={cancel} />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  left,
  onConfirm,
  onCancel,
}: {
  left: number;
  onConfirm: (dontWarn: boolean) => void;
  onCancel: () => void;
}) {
  const [dontWarn, setDontWarn] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{GUARD_TERMS.title}</DialogTitle>
        <DialogDescription>{GUARD_TERMS.body(left)}</DialogDescription>
      </DialogHeader>
      <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={dontWarn}
          onChange={(e) => setDontWarn(e.target.checked)}
          className="size-4 accent-amber-500"
        />
        {GUARD_TERMS.dontWarn}
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" autoFocus onClick={onCancel}>
          {GUARD_TERMS.keepPlaying}
        </Button>
        <Button className="bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={() => onConfirm(dontWarn)}>
          {GUARD_TERMS.endAnyway}
        </Button>
      </div>
    </>
  );
}
