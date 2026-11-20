import { GreyboxApp } from './ui/GreyboxApp';
import { LedgerShell } from './ui/LedgerShell';
import { isGreyboxRequested } from './ui/route';

export function App() {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  return isGreyboxRequested(search) ? <GreyboxApp /> : <LedgerShell />;
}
