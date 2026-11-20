export type LogFilter = 'all' | 'mine' | 'raids' | 'money';

export function matchesFilter(plain: string, filter: LogFilter, playerName: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'mine':
      return plain.includes(playerName);
    case 'raids':
      return /\braid/i.test(plain);
    case 'money':
      return /\$|Size Tax|Street Cash|Safe Cash/.test(plain);
  }
}

