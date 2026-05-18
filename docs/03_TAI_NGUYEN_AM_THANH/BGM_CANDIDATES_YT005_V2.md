# BGM Candidates — yt_005 v2

> **Ngày tạo**: 2026-05-19
> **Mục đích**: Thay BGM v0 (ElevenLabs Sound Gen API, 22s, bị user chê) bằng BGM tốt hơn dùng ElevenLabs Music API

---

## Nguồn thử nghiệm

### Phương án A — ElevenLabs Advertising & Brand Music Library
URL: `https://elevenlabs.io/app/music/explore/list/advertising-brand`

**Kết quả**: Không truy cập được. Trang là React SPA cần login session. WebFetch chỉ thấy HTML shell, không có catalog data.
Fallback sang Phương án B.

### Phương án B — ElevenLabs Music API (force_instrumental)
Endpoint: `POST https://api.elevenlabs.io/v1/music`
Params: `music_length_ms: 60000`, `force_instrumental: true`, `model_id: music_v1` (default)

---

## 3 Candidates Generated

| ID | File | Duration | Bitrate | Prompt Summary |
|---|---|---|---|---|
| A | `yt_005_bgm_v2_candidate_a.mp3` | 60.03s | 128kb/s | Upbeat energetic commercial, synths + percussion, TikTok kitchen showcase |
| B | `yt_005_bgm_v2_candidate_b.mp3` | 60.03s | 128kb/s | Light cheerful advertising, bright piano + subtle beat, warm friendly, social media product showcase |
| C | `yt_005_bgm_v2_candidate_c.mp3` | 60.03s | 128kb/s | Minimal groovy, clean pluck synth + simple beat, neutral tone, supports spoken narration |

### Prompts đầy đủ

**Candidate A**:
> Upbeat energetic commercial background music. Fast bright tempo, clean modern synths and light percussion. Product review video, advertising, TikTok Reels style. Instrumental only, no vocals. Shopping and lifestyle vibe. Kitchen gadget showcase.

**Candidate B** (được chọn cho final mix):
> Light cheerful advertising background music. Smooth corporate brand feel, bright piano melody and subtle modern beat, clean production. Product showcase social media Instagram Reels style. Warm and friendly, instrumental only, no vocals. Upbeat but gentle.

**Candidate C**:
> Minimal groovy upbeat background track. Clean repetitive rhythm with light pluck synth and simple beat. Social media content creator review style. No vocals. Fresh modern commercial feel, not too loud, neutral tone that supports spoken narration naturally.

---

## Candidate chọn: B

**Lý do chọn B**:
- "Bright piano melody + subtle modern beat" → dễ nghe dưới voice hơn synth/percussion nặng của A
- "Warm and friendly" → phù hợp review đồ gia dụng hơn là "groovy" hay "energetic"
- "Upbeat but gentle" → ít cạnh tranh với giọng đọc nhất
- Candidate C có thể hợp nhưng "minimal groovy" khó đoán direction hơn B

**Giới hạn**: Không thể nghe trực tiếp để so sánh — chọn dựa trên phân tích prompt.

---

## Mix Settings cho Final v2

| Param | Value | Ghi chú |
|---|---|---|
| BGM source | candidate_b.mp3 (60s) | Trim tự động bằng atrim trong ffmpeg |
| `--bgm-volume` | 0.15 (−16.5 dBFS) | Giống v0 |
| `--final-gain` | 1.3 (≈ +2.3 dB) | Mới — nâng loudness tổng ~30% |
| `--bgm-fadein` | 1.5s | |
| `--bgm-fadeout` | 3.0s | |

**QC kết quả v2**:
- max_volume: −9.0 dB (tăng +3.1 dB so với v0 −12.1 dB)
- mean_volume: −28.1 dB (tăng +4.4 dB so với v0 −32.5 dB)
- Không clipping (headroom 9.0 dB)
- 2 streams: AV1 video + AAC audio

---

## Files local (gitignored)

```
production/batch_001/yt_005/bgm/
  yt_005_bgm_v1_generated.mp3     ← v0 BGM (Sound Gen API, 22s) — dùng xong, tham khảo
  yt_005_bgm_v2_candidate_a.mp3   ← candidate A (60s)
  yt_005_bgm_v2_candidate_b.mp3   ← candidate B (60s) ← DÙNG CHO v2 FINAL MIX
  yt_005_bgm_v2_candidate_c.mp3   ← candidate C (60s)

production/batch_001/yt_005/bgm_mix_v2/
  yt_005_voice_bgm_mixed.mp3                 ← mixed audio (voice + BGM v2)
  yt_005_voice_blocks_bgm_v1_preview_vi.mp4  ← preview MP4 v2 (tên file có "bgm_v1" là từ script, dir là bgm_mix_v2)
  yt_005_bgm_mix_manifest.json               ← manifest với đủ params
```

> Binary audio/video không commit — đã có .gitignore.
