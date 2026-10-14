export function liveReadsAllowed(operationPending: boolean, scoutPending: boolean): boolean {
  return !operationPending || scoutPending;
}

export function walletBalancesReady(
  connectedAccount: string | null,
  observedAccount: string | null
): boolean {
  return Boolean(
    connectedAccount &&
      observedAccount &&
      connectedAccount.toLowerCase() === observedAccount.toLowerCase()
  );
}
