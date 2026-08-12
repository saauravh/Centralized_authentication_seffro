/**
 * Mobile numbers are stored exactly as the user typed them — there is no
 * canonical column — so any lookup has to normalise both sides first.
 *
 * The subscriber number is the identifying part: a country code may or may not
 * be present, and a trunk `0` may or may not be. Both are dropped so
 * "+91 98765 43210", "09876543210" and "9876543210" resolve to one another.
 */
export const PHONE_KEY_LENGTH = 10;

/** Shortest thing worth treating as a phone number rather than a typo. */
const MIN_DIGITS = 6;

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  if (digits.length < MIN_DIGITS) {
    return null;
  }

  return digits.length > PHONE_KEY_LENGTH ? digits.slice(-PHONE_KEY_LENGTH) : digits;
}

/**
 * Which kind of identifier the user typed.
 *
 * `@` is the test rather than a full email validation: an address is the only
 * identifier that can contain one, and anything else with an `@` is a typo that
 * should fail as a bad email rather than be dialled as a phone number.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
