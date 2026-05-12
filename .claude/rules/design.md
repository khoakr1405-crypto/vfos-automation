# Design Rules

## Nguyên tắc kiến trúc

- **YAGNI (You Aren't Gonna Need It)** — không build cho hypothetical future.
- **3 dòng giống nhau OK hơn premature abstraction.**
- **Single source of truth** — config, types, prompts không duplicate.
- **Boundary validation only** — validate input ở edge (HTTP handler, CLI args), không validate ở internal helper.

## Multi-agent / AI architecture

- **Mỗi agent có scope rõ ràng** — không overlap responsibility.
- **State sharing qua message bus**, không qua global variable.
- **Prompt cache** — luôn bật caching cho system prompt và stable context (TTL 5 phút).
- **Model selection:**
  - Reasoning nặng → `claude-opus-4-7`
  - Throughput cao, cost-sensitive → `claude-sonnet-4-6`
  - Tool-loop nhanh → `claude-haiku-4-5-20251001`

## File & folder layout

- Source code: `src/`
- Tests: `tests/` (mirror structure của `src/`)
- Config: `config/` hoặc root
- Scripts vận hành: `scripts/`
- Tài liệu: `docs/`
