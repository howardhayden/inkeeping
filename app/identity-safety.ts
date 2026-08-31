const UNICODE_FORMAT_OR_BIDI_CONTROL = /\p{Cf}/u;

export function containsUnicodeFormatControl(value: string): boolean {
  return UNICODE_FORMAT_OR_BIDI_CONTROL.test(value);
}

/**
 * Identity carriers must remain visibly attributable. Unicode format controls
 * can make a nonempty value render blank or reorder/occlude part of it, so they
 * are excluded without restricting ordinary Unicode letters and marks.
 */
export function assertIdentityText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be nonempty.`);
  if (containsUnicodeFormatControl(value)) {
    throw new Error(`${label} contains an unsupported Unicode format or bidirectional control.`);
  }
}
