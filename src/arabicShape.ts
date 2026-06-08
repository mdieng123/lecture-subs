// Pre-shapes Arabic text into Arabic Presentation Forms-B (U+FE70-U+FEFF) so
// libass + HarfBuzz don't need to perform contextual GSUB substitution. The
// bundled ffmpeg-static binary uses macOS CoreText, where the lam-alef-hamza
// ligature lookup returns a missing glyph and renders as tofu — pre-shaping
// supplies the precomposed codepoint directly so the font's cmap is hit.

type JoinType = 'D' | 'R' | 'U'

interface LetterInfo {
  type: JoinType
  iso: number
  fin?: number
  ini?: number
  med?: number
}

// Each Arabic letter mapped to its joining type and presentation forms.
// Dual-joining letters get 4 forms (iso/fin/ini/med); right-joining get 2
// (iso/fin); non-joining get 1 (iso).
const LETTERS: Record<number, LetterInfo> = {
  // Dual-joining
  0x0626: { type: 'D', iso: 0xFE89, fin: 0xFE8A, ini: 0xFE8B, med: 0xFE8C },
  0x0628: { type: 'D', iso: 0xFE8F, fin: 0xFE90, ini: 0xFE91, med: 0xFE92 },
  0x062A: { type: 'D', iso: 0xFE95, fin: 0xFE96, ini: 0xFE97, med: 0xFE98 },
  0x062B: { type: 'D', iso: 0xFE99, fin: 0xFE9A, ini: 0xFE9B, med: 0xFE9C },
  0x062C: { type: 'D', iso: 0xFE9D, fin: 0xFE9E, ini: 0xFE9F, med: 0xFEA0 },
  0x062D: { type: 'D', iso: 0xFEA1, fin: 0xFEA2, ini: 0xFEA3, med: 0xFEA4 },
  0x062E: { type: 'D', iso: 0xFEA5, fin: 0xFEA6, ini: 0xFEA7, med: 0xFEA8 },
  0x0633: { type: 'D', iso: 0xFEB1, fin: 0xFEB2, ini: 0xFEB3, med: 0xFEB4 },
  0x0634: { type: 'D', iso: 0xFEB5, fin: 0xFEB6, ini: 0xFEB7, med: 0xFEB8 },
  0x0635: { type: 'D', iso: 0xFEB9, fin: 0xFEBA, ini: 0xFEBB, med: 0xFEBC },
  0x0636: { type: 'D', iso: 0xFEBD, fin: 0xFEBE, ini: 0xFEBF, med: 0xFEC0 },
  0x0637: { type: 'D', iso: 0xFEC1, fin: 0xFEC2, ini: 0xFEC3, med: 0xFEC4 },
  0x0638: { type: 'D', iso: 0xFEC5, fin: 0xFEC6, ini: 0xFEC7, med: 0xFEC8 },
  0x0639: { type: 'D', iso: 0xFEC9, fin: 0xFECA, ini: 0xFECB, med: 0xFECC },
  0x063A: { type: 'D', iso: 0xFECD, fin: 0xFECE, ini: 0xFECF, med: 0xFED0 },
  0x0641: { type: 'D', iso: 0xFED1, fin: 0xFED2, ini: 0xFED3, med: 0xFED4 },
  0x0642: { type: 'D', iso: 0xFED5, fin: 0xFED6, ini: 0xFED7, med: 0xFED8 },
  0x0643: { type: 'D', iso: 0xFED9, fin: 0xFEDA, ini: 0xFEDB, med: 0xFEDC },
  0x0644: { type: 'D', iso: 0xFEDD, fin: 0xFEDE, ini: 0xFEDF, med: 0xFEE0 },
  0x0645: { type: 'D', iso: 0xFEE1, fin: 0xFEE2, ini: 0xFEE3, med: 0xFEE4 },
  0x0646: { type: 'D', iso: 0xFEE5, fin: 0xFEE6, ini: 0xFEE7, med: 0xFEE8 },
  0x0647: { type: 'D', iso: 0xFEE9, fin: 0xFEEA, ini: 0xFEEB, med: 0xFEEC },
  0x064A: { type: 'D', iso: 0xFEF1, fin: 0xFEF2, ini: 0xFEF3, med: 0xFEF4 },
  // Right-joining (only isolated + final forms)
  0x0622: { type: 'R', iso: 0xFE81, fin: 0xFE82 },
  0x0623: { type: 'R', iso: 0xFE83, fin: 0xFE84 },
  0x0624: { type: 'R', iso: 0xFE85, fin: 0xFE86 },
  0x0625: { type: 'R', iso: 0xFE87, fin: 0xFE88 },
  0x0627: { type: 'R', iso: 0xFE8D, fin: 0xFE8E },
  0x0629: { type: 'R', iso: 0xFE93, fin: 0xFE94 },
  0x062F: { type: 'R', iso: 0xFEA9, fin: 0xFEAA },
  0x0630: { type: 'R', iso: 0xFEAB, fin: 0xFEAC },
  0x0631: { type: 'R', iso: 0xFEAD, fin: 0xFEAE },
  0x0632: { type: 'R', iso: 0xFEAF, fin: 0xFEB0 },
  0x0648: { type: 'R', iso: 0xFEED, fin: 0xFEEE },
  0x0649: { type: 'R', iso: 0xFEEF, fin: 0xFEF0 },
  // Non-joining
  0x0621: { type: 'U', iso: 0xFE80 },
}

// Tashkeel (vowel marks) and other combining marks — transparent to joining
const TRANSPARENT = new Set([
  0x064B, 0x064C, 0x064D, 0x064E, 0x064F, 0x0650, 0x0651, 0x0652,
  0x0653, 0x0654, 0x0655, 0x0656, 0x0657, 0x0658, 0x0670,
])

// Lam + alef-variant collapse to a single ligature codepoint.
// Tuple is [isolated form, final form] — used when lam has no preceding joiner
// vs. when lam is medial.
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6], // ل + آ
  0x0623: [0xFEF7, 0xFEF8], // ل + أ
  0x0625: [0xFEF9, 0xFEFA], // ل + إ
  0x0627: [0xFEFB, 0xFEFC], // ل + ا
}

function joinsForward(cp: number): boolean {
  const info = LETTERS[cp]
  return !!info && info.type === 'D'
}

function joinsBackward(cp: number): boolean {
  const info = LETTERS[cp]
  return !!info && (info.type === 'D' || info.type === 'R')
}

function findPrevLetter(text: string, idx: number): number {
  for (let j = idx - 1; j >= 0; j--) {
    const cp = text.charCodeAt(j)
    if (TRANSPARENT.has(cp)) continue
    return cp
  }
  return -1
}

function findNextLetterIdx(text: string, idx: number): number {
  for (let j = idx + 1; j < text.length; j++) {
    const cp = text.charCodeAt(j)
    if (TRANSPARENT.has(cp)) continue
    return j
  }
  return -1
}

export function shapeArabic(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const cp = input.charCodeAt(i)

    // Lam-alef ligature: collapse ل + alef-variant into one codepoint
    if (cp === 0x0644) {
      const nextIdx = findNextLetterIdx(input, i)
      if (nextIdx >= 0) {
        const nextCp = input.charCodeAt(nextIdx)
        const pair = LAM_ALEF[nextCp]
        if (pair) {
          const prevCp = findPrevLetter(input, i)
          const hasPrevJoiner = prevCp >= 0 && joinsForward(prevCp)
          out += String.fromCharCode(hasPrevJoiner ? pair[1] : pair[0])
          // Pass through any transparent marks attached to the lam
          let j = i + 1
          while (j < nextIdx) {
            out += String.fromCharCode(input.charCodeAt(j))
            j++
          }
          i = nextIdx + 1
          continue
        }
      }
    }

    const info = LETTERS[cp]
    if (info) {
      const prevCp = findPrevLetter(input, i)
      const nextIdx = findNextLetterIdx(input, i)
      const nextCp = nextIdx >= 0 ? input.charCodeAt(nextIdx) : -1
      const canPrev = prevCp >= 0 && joinsForward(prevCp) && joinsBackward(cp)
      const canNext = nextCp >= 0 && joinsBackward(nextCp) && joinsForward(cp)

      let form: number
      if (canPrev && canNext && info.med !== undefined) form = info.med
      else if (canPrev && info.fin !== undefined) form = info.fin
      else if (canNext && info.ini !== undefined) form = info.ini
      else form = info.iso

      out += String.fromCharCode(form)
      i++
      continue
    }

    // Non-Arabic or transparent diacritic — pass through unchanged
    out += input[i]
    i++
  }
  return out
}
