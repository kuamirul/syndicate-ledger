import { useGameStore } from '@/store/gameStore';
import { plainStatusMessage } from '../terms';

export function StatusToast() {
  const message = useGameStore((s) => s.lastStatusMessage);
  if (!message) return null;
  const text = plainStatusMessage(message);
  const rejected = message.startsWith('Rejected');
  return (
    <p
      role="status"
      className={`rounded border px-3 py-1 text-xs ${rejected ? 'border-rose-500/40 text-rose-300' : 'border-zinc-800 text-zinc-300'}`}
    >
      {text}
    </p>
  );
}
