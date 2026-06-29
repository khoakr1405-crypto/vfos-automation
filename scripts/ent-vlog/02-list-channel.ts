// E1 step 02 — list a bound source-channel's recent videos (no download).
// CLI-only, no API key. Prints the candidate list as JSON to stdout (always JSON,
// even on failure) so the Studio route can parse one contract.
//   pnpm tsx scripts/ent-vlog/02-list-channel.ts --url <profile> --platform douyin --limit 10
import { parseArgs } from 'node:util';
import { listChannelVideos } from './lib/douyin-channel.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      platform: { type: 'string' },
      limit: { type: 'string' },
    },
    strict: true,
  });
  const url = values.url;
  const platform = values.platform;
  const limit = values.limit ? Number.parseInt(values.limit, 10) : 12;

  if (!url || (platform !== 'douyin' && platform !== 'tiktok')) {
    console.log(
      JSON.stringify({
        ok: false,
        code: 'BAD_PLATFORM',
        message: 'Usage: --url <profile> --platform <douyin|tiktok> [--limit N]',
      }),
    );
    process.exit(1);
  }

  const res = await listChannelVideos({
    url,
    platform,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 12,
    headful: process.env.DOUYIN_HEADFUL === '1',
  });
  console.log(JSON.stringify(res));
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      ok: false,
      code: 'LIST_FAILED',
      message: e instanceof Error ? e.message : String(e),
    }),
  );
  process.exit(1);
});
