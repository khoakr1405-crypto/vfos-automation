# VFOS — Entertainment Storytelling Content Layer V1 (Vlog Câu Cá)

> **Chuẩn NỘI DUNG dài hạn** cho lane Giải trí / Fishing-Vlog sau khi editing chuyển
> từ *highlight-compilation* → **STORY-BASED short-form** (hook money-shot → setup/persona
> → diễn biến → cao trào gần cuối → payoff/CTA). Áp cho **MỌI** video lane này.
> **Mục đích:** các round sau KHÔNG quay lại style highlight/clickbait rời rạc cũ.
>
> Chi tiết voice/script (câu, dấu câu, meme, QA): [VFOS_ENTERTAINMENT_CAPTION_STYLE_V1.md](VFOS_ENTERTAINMENT_CAPTION_STYLE_V1.md)
> · Spec lane: [VFOS_ENTERTAINMENT_LANE_SPEC.md](VFOS_ENTERTAINMENT_LANE_SPEC.md)
> · Hook engine: [`scripts/ent-vlog/lib/hook-style-bank.ts`](../../scripts/ent-vlog/lib/hook-style-bank.ts) + [`13-source-bound.ts`](../../scripts/ent-vlog/13-source-bound.ts)

---

## 0. Nguyên tắc — **1 câu chuyện, 3 vai**

Editing đã kể chuyện thì voice + chữ phải đi **cùng mạch truyện**. Nhưng 3 lớp có **vai khác nhau** — KHÔNG bê nguyên văn lớp này sang lớp kia:

| Lớp | Vai | Một câu |
|---|---|---|
| **① Voice/script trong video** | người **KỂ** | kể trọn cung truyện |
| **② Caption chữ trong video** | **NHỊP** truyện rút gọn | tắt tiếng đọc lướt vẫn hiểu |
| **③ Caption đăng bài (TikTok/FB)** | **MỒI** câu chuyện | dừng cuộn + CTA mềm + hashtag |

**Luật chung cả 3 lớp:** ngắn · đời · có nhịp · **bám footage thật** · KHÔNG bịa số/loài/thành tích/tình tiết · KHÔNG giật tít clickbait rời rạc.

---

## 1. Lớp ① — Voice/script (người kể)

- Theo trọn [CAPTION_STYLE_V1](VFOS_ENTERTAINMENT_CAPTION_STYLE_V1.md) (câu 8–14 từ, dấu câu cho TTS, bám ASR, Việt hóa meme, **đúng loài theo vision**).
- **Hook 0–5s:** 1 câu **8–13 từ**, voice bắt đầu **<1.5s**, bám money-shot SẠCH (đã qua title-gate), xoay **6 nhóm Hook Style Bank**, KHÔNG lặp mô-típ giữa các job *(engine: `hook-style-bank.ts`)*.
- **Cung truyện:** hook → persona/setup → buildup/escalation → climax (con to nhất, gần cuối) → resolution + **CTA mềm** ("Theo dõi xem buổi sau…").
- **Reaction layer** (`Ha ha,`/`Đúng bài rồi,`…): GIỮ **ÍT (3–5)**, chỉ ở money-shot thật — không để lấn giọng kể.

## 2. Lớp ② — Caption chữ trong video (nhịp truyện)

- Mục tiêu: người **tắt tiếng** đọc lướt vẫn theo được mạch.
- **1 ý / 1 màn**, NGẮN (≤ ~7–8 từ), giọng kể đời, nhấn 1 từ khoá.
- Mỗi cú cá/mực lên = 1 câu **theo mạch truyện**; KHÔNG spam reaction kiểu "DÍNH RỒI!".
- **KHÔNG bê verbatim** cả câu voice dài (giảm tải đọc) — caption là bản *gọn* của beat đang chiếu.
- 🧊 **ĐÓNG BĂNG style highlight cũ** ("DÍNH RỒI!"/"CON NÀY BỰ THIỆT!" trong [`09-caption-content.ts`](../../scripts/ent-vlog/09-caption-content.ts)): chỉ cho highlight-compilation cũ, **KHÔNG dùng** cho story-based.

## 3. Lớp ③ — Caption đăng bài (mồi câu chuyện)

- **Dòng 1:** mồi truyện/persona — câu **dừng-cuộn** ≤ ~12 từ, đời, gây tò mò (KHÔNG "Xem ngay video câu cá cực đỉnh 🔥").
- **Dòng 2 (tuỳ):** CTA mềm / câu hỏi kéo comment.
- **Hashtag:** 3–6 cái **liên quan** (không nhồi 10+).
- Qualitative ("cá lên đều tay", "trúng"), **KHÔNG con số/cân nặng/loài bịa**.
- *(sinh ở [`16-package.ts`](../../scripts/ent-vlog/16-package.ts) / publish caption — chỉnh ở round sau)*

---

## 4. Ví dụ chuẩn (bám footage, không bịa)

**Hook (voice + mở màn) — 5 giọng:**
1. *(bất ngờ)* "Mới buông cần thôi mà nó đớp liền, đỡ không kịp."
2. *(hỏi người xem)* "Trưa nắng vầy mà có người vẫn ra biển, đoán xem vì sao?"
3. *(căng nhịp)* "Cần cong gập, dây căng hết cỡ, phải ghì chắc tay."
4. *(persona)* "Vùng biển này tôi câu quen tới mức nhắm mắt cũng trúng."
5. *(hứa hẹn/payoff)* "Con này mới mở màn, để coi tới cuối còn gì."

**Caption trong video — 5 câu (gọn, theo nhịp):**
1. "Mới thả đã dính."
2. "Con này kéo căng cần."
3. "Trưa vắng mà lên đều."
4. "Tới con bự nhất rồi."
5. "Mát tay thiệt sự."

**Caption đăng bài — 5 mẫu (mồi + CTA mềm + hashtag):**
1. "Trưa nắng gắt mà vẫn ra biển — và biển không phụ. Bạn câu giờ này bao giờ chưa? 🎣 #cauca #vlogcauca #biendong"
2. "Mới buông cần đã có chuyện, coi tới cuối nha. #caumuc #cauca #fyp"
3. "Đi câu một mình mà vui như đi hội, cá lên đều tay. #vlogcauca #giaitri #xuhuong"
4. "Không nghĩ trưa vắng vầy lại trúng — đoán con cuối cỡ nào? #cauca #biendong #fyp"
5. "Tay câu vùng này chưa làm ai về tay không đâu. #caumuc #vlogcauca #reupvietnam"

---

## 5. Ranh giới (BẮT BUỘC)

- **KHÔNG** thêm gate duyệt mới.
- **KHÔNG** đụng BGM · visual hook · blur che sub Trung (chủ ý Operator) · Product Review · auto-publish.
- Spec là **ĐỊNH HƯỚNG**; áp code ở round sau khi Operator ra lệnh:
  - Lớp ① — đã có Hook Style Bank (✅).
  - Lớp ② — cần thêm bước "caption gọn theo nhịp" (chưa code).
  - Lớp ③ — cần viết lại caption đăng bài theo cấu trúc mồi-truyện (chưa code).

---

*V1 — chốt định hướng nội dung story-based. Cập nhật khi áp code lớp ②/③ (V2).*
