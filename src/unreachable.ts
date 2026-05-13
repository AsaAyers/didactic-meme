/**
 * Utility for exhaustive switch/if-else checks.
 * TypeScript narrows `t` to `never` when all union members are handled;
 * this function then becomes unreachable at compile time (and throws at
 * runtime if somehow reached, e.g. from untyped JavaScript callers).
 */
export function unreachable(t: never): never {
  throw new Error(`Unreachable code reached: ${JSON.stringify(t)}`);
}
