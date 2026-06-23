// Chinese → Vietnamese fishing/lure-fishing glossary for transcreation.
// Keeps domain terms accurate so the model doesn't mistranslate angling jargon.
// Injected into the transcreation prompt as reference (not a hard find/replace).
export const FISHING_GLOSSARY: Array<{ zh: string; vi: string; note?: string }> = [
  { zh: '路亚', vi: 'câu lure', note: 'lure fishing' },
  { zh: '抛投 / 抛竿', vi: 'quăng mồi / ném cần' },
  { zh: '中鱼', vi: 'dính cá / ăn mồi' },
  { zh: '遛鱼', vi: 'dòng cá / dắt cá', note: 'tiring the fish out' },
  { zh: '鱼护', vi: 'giỏ nhốt cá' },
  { zh: '钓点', vi: 'điểm câu / chỗ câu' },
  { zh: '饵 / 假饵 / 软饵', vi: 'mồi / mồi giả / mồi mềm' },
  { zh: '咬钩 / 吃口', vi: 'cá đớp / ăn câu' },
  { zh: '收线', vi: 'thu dây / cuốn dây' },
  { zh: '竿 / 鱼竿', vi: 'cần / cần câu' },
  { zh: '轮 / 渔轮 / 纺车轮', vi: 'máy câu / máy đứng' },
  { zh: '爆护', vi: 'trúng đậm / câu bội thu', note: 'big catch session' },
  { zh: '空军', vi: 'về tay không / móm', note: 'caught nothing' },
  { zh: '鱿鱼', vi: 'mực' },
  { zh: '海钓', vi: 'câu biển' },
  { zh: '矶钓', vi: 'câu ghềnh đá' },
  { zh: '船钓', vi: 'câu trên thuyền' },
  { zh: '石斑 / 石斑鱼', vi: 'cá mú' },
  { zh: '鲈鱼', vi: 'cá vược / cá chẽm' },
  { zh: '黄鳍', vi: 'cá ngừ vây vàng' },
  { zh: '溜', vi: 'dòng (cá)' },
  { zh: '钓友 / 钓鱼人', vi: 'anh em câu cá / cần thủ' },
  { zh: '南海', vi: 'Biển Đông', note: 'South China Sea — dùng "Biển Đông" cho khán giả VN' },
];

/** Render the glossary as a compact reference block for prompts. */
export function glossaryBlock(): string {
  return FISHING_GLOSSARY.map((g) => `- ${g.zh} = ${g.vi}${g.note ? ` (${g.note})` : ''}`).join(
    '\n',
  );
}
