/**
 * Get the value of an inline field from task text.
 * Inline fields have the form `key:value` where value is a non-whitespace token.
 * Examples: `due:2026-05-03`, `repeat:2s`, `completionDate:2026-05-03`
 *
 * `key` must consist solely of word characters (letters, digits, underscore).
 * Throws if the key contains characters that could alter the regex pattern.
 */
export function getInlineField(text: string, key: string): string | undefined {
  if (!/^\w+$/.test(key)) throw new Error(`Invalid inline field key: ${key}`);
  const regex = new RegExp(`(?:^|\\s)${key}:(\\S+)`);
  const match = text.match(regex);
  return match ? match[1] : undefined;
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
  if (!/^\w+$/.test(key)) throw new Error(`Invalid inline field key: ${key}`);
  const regex = new RegExp(`((?:^|\\s))${key}:\\S+`);
  if (regex.test(text)) {
    return text.replace(regex, `$1${key}:${value}`);
  }
  return `${text} ${key}:${value}`;
}
