# Tech Defaults

## Stack mặc định cho dự án này

| Lớp | Default | Khi nào đổi |
|---|---|---|
| Runtime | Node.js LTS (>=20) | Cần edge runtime → Bun/Deno |
| Package manager | `pnpm` | Lib publish public → `npm` |
| Language | TypeScript (strict) | Script throwaway → JS được |
| Testing | Vitest | E2E → Playwright |
| Linter | Biome (replaces ESLint+Prettier) | Team đã set ESLint → giữ |
| AI orchestration | LangChain / n8n / Custom | Multi-agent complex → CrewAI/AutoGen |
| LLM provider | Anthropic Claude (`@anthropic-ai/sdk`) | Cost-sensitive batch → cân nhắc |
| Database | Postgres + Drizzle ORM | Document-heavy → MongoDB |
| Queue | BullMQ (Redis) | Lightweight → in-memory |
| Logging | Pino | — |

## Code style

- **No `any`** — dùng `unknown` rồi narrow.
- **No default export** trừ Next.js page/component constraint.
- **Async/await** thay vì `.then()`.
- **Early return** thay vì `if/else` lồng.
- **Const assertion** cho literal type (`as const`).

## Claude API best practices

- Luôn bật **prompt caching** (`cache_control: { type: "ephemeral" }`).
- System prompt + tool definitions phải **stable** (đặt vào cache).
- Dynamic content (user message) đặt **sau** cached blocks.
- Streaming SSE cho UX tốt hơn polling.
