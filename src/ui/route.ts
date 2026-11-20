/** `?greybox=1` keeps the raw greybox view available; the ledger shell is the default. */
export function isGreyboxRequested(search: string): boolean {
  return new URLSearchParams(search).get('greybox') === '1';
}
