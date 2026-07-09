// Subtitle chunker (RFC §2.3 — tầng caption) — cắt voiceover văn nói thành các
// dòng phụ đề ≤ 12 từ. LOGIC CHUỖI THUẦN, KHÔNG gọi AI.
//   - tách câu bằng splitSentences (đã có), đếm từ bằng countWords (đã có);
//   - câu ≤ 12 từ giữ nguyên; câu dài chẻ ưu tiên tại dấu phẩy / chấm phẩy / liên từ;
//   - GLUE cặp bất khả phân → không bao giờ cắt giữa:
//       (A) <số> + <đơn vị tiền>       : "199.000 VNĐ", "45.000 đồng", "50 nghìn"
//       (B) <nhãn HOA> + <giá trị số>  : "UPF 50+", "SPF 50", "USB 3.0"
// Bất biến: ghép mọi dòng lại (space) = câu gốc (không mất/thêm từ).

import { countWords } from '@vfos/script-writer';
import { splitSentences } from './validation-engine.js';

export const MAX_SUBTITLE_WORDS = 12;

// Liên từ hay đứng đầu vế → ưu tiên chẻ TRƯỚC chúng (giữ vế mạch lạc).
const CONJUNCTIONS = new Set([
  'và',
  'thì',
  'mà',
  'là',
  'nhưng',
  'hoặc',
  'nên',
  'vì',
  'để',
  'rồi',
  'còn',
  'nếu',
  'khi',
]);

// Đơn vị tiền/tỷ lệ đi liền sau con số — không tách khỏi con số.
const PRICE_UNITS = new Set([
  'đ',
  'đồng',
  'vnđ',
  'vnd',
  'k',
  'nghìn',
  'ngàn',
  'nghin',
  'triệu',
  'tỷ',
  'tỉ',
  'xu',
  '%',
]);

interface Atom {
  text: string;
  words: number;
  endsWithBreak: boolean;
  isConjunction: boolean;
}

// Bỏ ký tự không phải chữ/số/'%' ở hai đầu (để so khớp liên từ / đơn vị tiền).
function stripEdgePunct(word: string): string {
  return word.replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, '');
}

// "199.000" / "1.500.000" / "10,5" / "9" — con số (kết thúc bằng chữ số).
function isPriceNumber(word: string): boolean {
  return /^\d[\d.,]*\d$|^\d$/.test(word);
}

// Nhãn thông số viết HOA 2–5 ký tự ASCII: UPF, SPF, USB, IP, UV… (đứng trước giá trị).
function isSpecLabel(word: string): boolean {
  return /^[A-Z]{2,5}$/.test(word);
}

// Token bắt đầu bằng chữ số → phần "giá trị": 50+, 50, 3.0, 68…
function startsWithDigit(word: string): boolean {
  return /^\d/.test(word);
}

// Cặp (word, next) có phải khối bất khả phân không? (đơn vị tiền hoặc nhãn↔giá trị).
function gluesWithNext(word: string, next: string): boolean {
  if (isPriceNumber(word) && PRICE_UNITS.has(stripEdgePunct(next).toLowerCase())) return true;
  if (isSpecLabel(word) && startsWithDigit(next)) return true;
  return false;
}

// Tách câu thành atom; ghép cặp bất khả phân (giá tiền / nhãn↔giá trị) thành 1 atom.
function buildAtoms(sentence: string): Atom[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const atoms: Atom[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === undefined) continue;
    const next = words[i + 1];
    if (next !== undefined && gluesWithNext(word, next)) {
      atoms.push({
        text: `${word} ${next}`,
        words: 2,
        endsWithBreak: /[,;]$/.test(next),
        isConjunction: false,
      });
      i++;
      continue;
    }
    atoms.push({
      text: word,
      words: 1,
      endsWithBreak: /[,;]$/.test(word),
      isConjunction: CONJUNCTIONS.has(stripEdgePunct(word).toLowerCase()),
    });
  }
  return atoms;
}

// Chẻ atom thành các "vế" tự nhiên: ngắt SAU dấu phẩy/chấm phẩy, ngắt TRƯỚC liên từ.
function buildPhrases(atoms: Atom[]): Atom[][] {
  const phrases: Atom[][] = [];
  let cur: Atom[] = [];
  for (const atom of atoms) {
    if (atom.isConjunction && cur.length > 0) {
      phrases.push(cur);
      cur = [];
    }
    cur.push(atom);
    if (atom.endsWithBreak) {
      phrases.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) phrases.push(cur);
  return phrases;
}

// Gói các vế thành dòng ≤ max từ; vế nào tự thân > max thì chẻ cứng theo atom.
function packLines(phrases: Atom[][], max: number): string[] {
  const lines: string[] = [];
  let cur: Atom[] = [];
  let curWords = 0;
  const flush = () => {
    if (cur.length > 0) {
      lines.push(cur.map((a) => a.text).join(' '));
      cur = [];
      curWords = 0;
    }
  };
  for (const phrase of phrases) {
    const phraseWords = phrase.reduce((sum, a) => sum + a.words, 0);
    if (phraseWords > max) {
      // Vế quá dài không có dấu ngắt/liên từ bên trong → chẻ cứng theo atom.
      flush();
      for (const atom of phrase) {
        if (curWords + atom.words > max && cur.length > 0) flush();
        cur.push(atom);
        curWords += atom.words;
      }
      flush();
      continue;
    }
    if (curWords + phraseWords > max && cur.length > 0) flush();
    cur.push(...phrase);
    curWords += phraseWords;
  }
  flush();
  return lines;
}

export function chunkForSubtitles(text: string, max: number = MAX_SUBTITLE_WORDS): string[] {
  const lines: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (countWords(sentence) <= max) {
      lines.push(sentence);
      continue;
    }
    lines.push(...packLines(buildPhrases(buildAtoms(sentence)), max));
  }
  return lines;
}
