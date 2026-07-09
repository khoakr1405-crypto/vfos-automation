// Claim blocklist — DATA thuần (RFC §2.1). HYBRID: PHRASE_RULES (mảng literal,
// Operator đọc/sửa được) là chính; PATTERN_RULES (regex có kiểm soát) cho claim
// SỐ không liệt kê hết được. Rule viết ở dạng thường + NFC để khớp bản normalized
// (validation-engine chuẩn hoá text về lowercase+NFC trước khi quét).

import type { PatternRule, PhraseRule } from './types.js';

export const PHRASE_RULES: PhraseRule[] = [
  // superlative / tuyệt đối (agent-spec SKILL.md Section I)
  {
    id: 'superlative-tot-nhat',
    phrase: 'tốt nhất',
    severity: 'hard',
    category: 'superlative',
    note: 'không so sánh tuyệt đối',
  },
  { id: 'abs-safe', phrase: 'an toàn tuyệt đối', severity: 'hard', category: 'absolute', note: '' },
  {
    id: 'sieu-manh-nhat',
    phrase: 'siêu mạnh nhất',
    severity: 'hard',
    category: 'superlative',
    note: '',
  },
  {
    id: 'never-kep-toc',
    phrase: 'không bao giờ kẹt tóc',
    severity: 'hard',
    category: 'absolute',
    note: '',
  },
  {
    id: 'mat-nhu-dieu-hoa',
    phrase: 'mát như điều hòa',
    severity: 'hard',
    category: 'false-equiv',
    note: '',
  },
  {
    id: 'thay-the-dieu-hoa',
    phrase: 'thay thế điều hòa',
    severity: 'hard',
    category: 'false-equiv',
    note: '',
  },
  {
    id: 'pin-trau-ca-ngay',
    phrase: 'pin trâu cả ngày',
    severity: 'soft',
    category: 'exaggeration',
    note: 'phóng đại pin — cảnh báo, không chặn cứng',
  },
  // health claim (agent-spec: claim sức khỏe/làm đẹp/y tế không bằng chứng)
  {
    id: 'chua-bach-benh',
    phrase: 'chữa bách bệnh',
    severity: 'hard',
    category: 'health-claim',
    note: '',
  },
  {
    id: 'tri-dut-diem',
    phrase: 'trị dứt điểm',
    severity: 'hard',
    category: 'health-claim',
    note: '',
  },
  // Operator mở rộng danh sách seed tại đây.
];

export const PATTERN_RULES: PatternRule[] = [
  // "cam kết 100%" / "cam kết 50 %" — bắt mọi số %, không chỉ 100.
  {
    id: 'commit-percent',
    pattern: /cam\s*kết\s*\d+\s*%/,
    severity: 'hard',
    category: 'guarantee',
    note: 'cam kết N% (guarantee)',
  },
  // "giảm 2kg" / "giảm 5 cân" — claim giảm cân theo số.
  {
    id: 'lose-weight',
    pattern: /giảm\s*\d+\s*(kg|cân)/,
    severity: 'hard',
    category: 'health-claim',
    note: 'giảm N kg/cân',
  },
  // "100% an toàn" / "99 % hiệu quả".
  {
    id: 'pct-effective',
    pattern: /\d+\s*%\s*(an\s*toàn|hiệu\s*quả)/,
    severity: 'hard',
    category: 'guarantee',
    note: 'N% an toàn/hiệu quả',
  },
  // "trị dứt điểm" / "chữa khỏi hẳn" / "trị bách bệnh".
  {
    id: 'cure-absolute',
    pattern: /(trị|chữa)\s+(dứt\s*điểm|khỏi\s*hẳn|bách\s*bệnh)/,
    severity: 'hard',
    category: 'health-claim',
    note: 'trị/chữa dứt điểm/khỏi hẳn/bách bệnh',
  },
];
