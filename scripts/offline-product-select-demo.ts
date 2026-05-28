/**
 * CLI Tool — Offline Shopee Product Selection & Match Builder.
 *
 * Spawns in StepRunner:
 * 1. Reads local shopee product candidates.
 * 2. Selects candidate by generalized rules:
 *    - If --productId is specified, select candidate matching index or productId value.
 *    - Otherwise, default to the first candidate.
 * 3. Builds a unified product_match_artifact.json matching ProductMatchGuard schema.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    candidatesFile: { type: 'string' },
    outFile: { type: 'string' },
    productId: { type: 'string' },
    detectedProductName: { type: 'string' },
    detectedCategory: { type: 'string' },
    detectedFormFactor: { type: 'string' },
    detectedUseCase: { type: 'string' },
    forceMatchAxes: { type: 'string', default: 'all-pass' }, // all-pass, minor-fail, blocking-fail
  },
  allowPositionals: false,
  strict: true,
});

async function main() {
  const candidatesPath = values.candidatesFile;
  const outPath = values.outFile;

  if (!candidatesPath || !outPath) {
    console.error('Missing required arguments: --candidatesFile and --outFile');
    process.exit(1);
  }

  // 1. Read candidates
  if (!existsSync(candidatesPath)) {
    console.error(`Candidates file not found at: ${candidatesPath}`);
    process.exit(1);
  }

  let candidatesJson: any;
  try {
    candidatesJson = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse candidates JSON:', err);
    process.exit(1);
  }

  const productsList: any[] = candidatesJson?.products || [];

  if (productsList.length === 0) {
    console.error('No candidates found in candidates JSON file.');
    process.exit(1);
  }

  // 2. Selection Rule
  let selectedCandidate: any = null;

  if (values.productId) {
    const idVal = values.productId.trim();
    // Try finding by candidate index, productId key, or searching rawLines
    selectedCandidate = productsList.find((p) => {
      const idxStr = String(p.index);
      return idxStr === idVal || p.productId === idVal;
    });

    if (!selectedCandidate) {
      console.error(`Selection failed: No product candidate matching ID/Index "${idVal}" was found.`);
      process.exit(1);
    }
  } else {
    // Default: choose first candidate in list
    selectedCandidate = productsList[0];
    if (!selectedCandidate) {
      console.error('Selection failed: The candidates product list is empty or corrupted.');
      process.exit(1);
    }
  }

  // Parse rawLines to extract product name and price safely
  const rawLines: string[] = selectedCandidate.rawLines || [];
  if (rawLines.length === 0) {
    console.error('Selection failed: Chosen candidate has empty or missing rawLines.');
    process.exit(1);
  }

  const nameLine = rawLines.find(
    (line) =>
      line.length > 10 &&
      !line.startsWith('₫') &&
      !line.includes('%') &&
      !line.includes('bán') &&
      !line.includes('Lấy link')
  ) || rawLines[0] || 'Unknown Product';
  const priceLine = rawLines.find((line) => line.startsWith('₫')) || '₫0';

  console.log(`[P6 SELECT] Chosen Candidate Index ${selectedCandidate.index}: "${nameLine}" - Price: ${priceLine}`);

  // 3. Build mock video candidate match parameters
  const detectedName = values.detectedProductName || nameLine;
  const detectedCategory = values.detectedCategory || 'household_essentials';
  const detectedFormFactor = values.detectedFormFactor || 'roll_paper';
  const detectedUseCase = values.detectedUseCase || 'cleaning';

  // 4. Determine match axes based on simulation setting
  let matchAxes = {
    function: true,
    formFactor: true,
    usage: true,
    context: true,
    productNature: true,
  };

  if (values.forceMatchAxes === 'minor-fail') {
    matchAxes.formFactor = false; // 4/5 axes -> warn/near_pass
  } else if (values.forceMatchAxes === 'blocking-fail') {
    matchAxes.function = false;
    matchAxes.formFactor = false;
    matchAxes.usage = false; // 2/5 axes -> fail/blocking
  }

  const matchArtifact = {
    shopeeProduct: {
      productId: selectedCandidate.productId || `shopee_idx_${selectedCandidate.index}`,
      name: nameLine,
      category: 'household_essentials',
      formFactor: 'roll_paper',
      useCase: 'cleaning',
      priceRange: priceLine,
    },
    videoCandidate: {
      sourceId: 'demo_video_001',
      detectedProductName: detectedName,
      detectedCategory: detectedCategory,
      detectedFormFactor: detectedFormFactor,
      detectedUseCase: detectedUseCase,
      visualContext: 'home_review',
    },
    matchAxes,
  };

  // Ensure output directory
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, JSON.stringify(matchArtifact, null, 2), 'utf8');
  console.log(`[P6 SELECT] Successfully generated match artifact at: ${outPath}`);
}

main().catch((err) => {
  console.error('Selection failed:', err);
  process.exit(1);
});
