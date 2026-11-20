import { Badge } from '@/components/ui/badge';
import { signedMoney } from './format';

/** Inline last-change badge: emerald for gains, rose for losses, nothing for zero. */
export function DeltaBadge({ amount }: { amount: number }) {
  if (amount === 0) return null;
  return (
    <Badge variant={amount > 0 ? 'success' : 'destructive'} data-testid="cash-delta">
      {signedMoney(amount)}
    </Badge>
  );
}
