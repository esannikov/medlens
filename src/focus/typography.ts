export const LENS_FONT_FAMILY = '"MedLens Iosevka", monospace';
export const FALLBACK_FONT_FAMILY = 'ui-monospace, "SFMono-Regular", Consolas, monospace';
export const LENS_FONT_WEIGHTS = [400, 500, 600] as const;
export const LENS_FONT_PROBE = 'ІіЇїЄєҐґ αβγλ µμ ≤≥−× 10⁹ 0123456789';

/** Choose one complete typeface before measuring any graph labels. A failed
 * or slow font request leaves a usable, explicitly measured monospace fallback. */
export function loadLensTypeface(fonts: Pick<FontFaceSet,"load"> = document.fonts, timeoutMs = 2500): Promise<string> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(FALLBACK_FONT_FAMILY), timeoutMs);
    Promise.resolve().then(() => Promise.all(LENS_FONT_WEIGHTS.map(weight => fonts.load(`${weight} 14px "MedLens Iosevka"`,LENS_FONT_PROBE))))
      .then(faces => resolve(faces.every(matches=>matches.length>0) ? LENS_FONT_FAMILY : FALLBACK_FONT_FAMILY))
      .catch(() => resolve(FALLBACK_FONT_FAMILY))
      .finally(() => clearTimeout(timer));
  });
}
