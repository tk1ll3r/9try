/** The side of the stored picture, in pixels. It is drawn at up to 96 px, so this stays sharp on a dense screen. */
export const avatarSide = 160;

/** The most characters a stored picture may have. The database refuses more (migration 0032). */
export const avatarMaxLength = 60_000;

const share = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The square of a picture that a crop keeps, in the picture's own pixels. `zoom` 1 keeps the largest
 * square that fits; a larger zoom keeps a smaller one. `x` and `y`, from 0 to 1, move the square across
 * what is left over: 0.5 is the middle.
 */
export function cropSquare(width: number, height: number, zoom: number, x: number, y: number): { left: number; top: number; side: number } {
  const side = Math.min(width, height) / Math.max(1, zoom);
  return { left: (width - side) * share(x), top: (height - side) * share(y), side };
}
