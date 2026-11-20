export function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
}

export function signedMoney(n: number): string {
  return `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US')}`;
}
