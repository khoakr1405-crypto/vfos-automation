import { z } from 'zod';
import type { SyscallSpec } from '../syscall-registry.js';

const ScoreInput = z.object({
  url: z.string().url(),
  views_per_hour: z.number().nonnegative(),
  engagement_rate: z.number().min(0).max(1),
  saves_per_view: z.number().min(0).max(1).default(0),
  comments_per_view: z.number().min(0).max(1).default(0),
});

export const trendScore: SyscallSpec = {
  name: 'trend.score',
  description: 'Compute viral score (0-100) from engagement metrics.',
  requiredScope: 'trend.score',
  handler: async (_ctx, raw) => {
    const m = ScoreInput.parse(raw);
    const velocity = Math.log10(m.views_per_hour + 1) * 0.45;
    const engagement = m.engagement_rate * 100 * 0.3;
    const saves = m.saves_per_view * 100 * 0.15;
    const comments = m.comments_per_view * 100 * 0.1;
    const raw_score = (velocity + engagement + saves + comments) * 10;
    const score = Math.min(100, Math.max(0, raw_score));
    return {
      url: m.url,
      score: Number(score.toFixed(2)),
      components: {
        velocity: Number(velocity.toFixed(3)),
        engagement: Number(engagement.toFixed(3)),
        saves: Number(saves.toFixed(3)),
        comments: Number(comments.toFixed(3)),
      },
    };
  },
};
