import invariant from "tiny-invariant";

/**
 * Get the value of an inline field from task text.
 * Inline fields have the form `key:value` where value is a non-whitespace token.
 * Examples: `due:2026-05-03`, `repeat:2s`, `done:2026-05-03`
 *
 * `key` must consist solely of word characters (letters, digits, underscore).
 * Throws if the key contains characters that could alter the regex pattern.
 */
export function getInlineField(text: string, key: string): string | undefined {
  invariant(/^\w+$/.test(key), `Invalid inline field key: ${key}`)
  const regex = new RegExp(`(?:^|\\s)${key}:(\\S+)`);
  const match = text.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Remove an inline field from task text.
 * If the field does not exist, returns the original text unchanged.
 * Removes the `key:value` token along with any preceding whitespace so that
 * the result does not contain stray leading/trailing spaces.
 *
 * `key` must consist solely of word characters (letters, digits, underscore).
 * Throws if the key contains characters that could alter the regex pattern.
 */
export function removeInlineField(text: string, key: string): string {
  invariant(/^\w+$/.test(key), `Invalid inline field key: ${key}`);
  // Match an optional preceding space (or start-of-string) plus key:value.
  // Replacing the whole match (including the leading space, if any) with ''
  // ensures no double-spaces are left behind.
  return text.replace(new RegExp(`(^|\\s)${key}:\\S+`), '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Set or replace an inline field in task text.
 * If the field already exists, its value is replaced in-place.
 * If not, `key:value` is appended at the end of the text.
 *
 * `key` must consist solely of word characters (letters, digits, underscore).
 * Throws if the key contains characters that could alter the regex pattern.
 */
export function setInlineField(text: string, key: string, value: string): string {
  invariant( /^\w+$/.test(key), `Invalid inline field key: ${key}`);
  const regex = new RegExp(`((?:^|\\s))${key}:\\S+`);
  if (regex.test(text)) {
    return text.replace(regex, `$1${key}:${value}`);
  }
  return `${text} ${key}:${value}`;
}
