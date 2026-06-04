import { generateWeeklyReport } from '../src/lib/growth-data/weekly-report-generator';

function main(): number {
  // Parse CLI args
  const args = process.argv.slice(2);
  let weekId: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && args[i + 1]) {
      weekId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  try {
    const result = generateWeeklyReport({ weekId, dryRun });

    if (dryRun) {
      console.log('\n=== WEEKLY GROWTH REPORT GENERATION (DRY RUN) ===');
      console.log(`Week ID:          ${result.weekId}`);
      console.log(
        `Period:           ${result.periodStart.split('T')[0]} to ${result.periodEnd.split('T')[0]}`,
      );
      console.log(`Confidence:       ${result.dataConfidence.toUpperCase()}`);
      console.log(`Total Views:      ${result.kpi.views.toLocaleString()}`);
      console.log(`Total Clicks:     ${result.kpi.clicks.toLocaleString()}`);
      console.log(`Total Conversions:${result.kpi.conversions.toLocaleString()}`);
      console.log(
        `CTR:              ${result.kpi.ctr !== null ? `${(result.kpi.ctr * 100).toFixed(2)}%` : 'N/A'}`,
      );
      console.log(
        `CVR:              ${result.kpi.conversionRate !== null ? `${(result.kpi.conversionRate * 100).toFixed(2)}%` : 'N/A'}`,
      );
      console.log(`Decisions count:  ${result.decisionsCount}`);
      console.log('[DRY RUN] Báo cáo được sinh trong memory thành công. Không ghi file ra đĩa.');
    } else {
      console.log('\n✅ Báo cáo tuần đã được tạo thành công:');
      console.log(`- JSON: ${result.jsonFilePath}`);
      console.log(`- Markdown: ${result.markdownFilePath}`);
    }
    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Lỗi khi sinh báo cáo:', msg);
    return 1;
  }
}

process.exit(main());
