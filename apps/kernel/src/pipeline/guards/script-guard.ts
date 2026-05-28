/**
 * Script Guard — Validates structural integrity and constraints of script artifacts.
 *
 * Implements the Guard interface to parse script JSON/text files, enforcing content presence,
 * minimum/maximum lengths, schema correctness, and checking for banned phrases.
 */

import { readFileSync, existsSync } from 'node:fs';
import type { Guard } from '../guard-runner.js';

export interface ScriptGuardConfig {
  minCharacters?: number;
  maxCharacters?: number;
  bannedPhrases?: string[];
  targetStep?: string;
}

export class ScriptGuard implements Guard {
  readonly guardName = 'ScriptGuard';
  readonly targetStep: string;

  private readonly minCharacters: number;
  private readonly maxCharacters: number;
  private readonly bannedPhrases: string[];

  constructor(config?: ScriptGuardConfig) {
    this.targetStep = config?.targetStep ?? 'script:generate';
    this.minCharacters = config?.minCharacters ?? 20;
    this.maxCharacters = config?.maxCharacters ?? 5000;
    this.bannedPhrases = config?.bannedPhrases ?? ['fake link', 'reup content', 'scam product'];
  }

  async validate(
    artifactPath: string,
  ): Promise<Omit<import('../guard-runner.js').GuardReport, 'startedAt' | 'finishedAt' | 'durationMs' | 'artifactPath'>> {
    const reasons: string[] = [];

    // 1. Verify existence
    if (!existsSync(artifactPath)) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Artifact script file does not exist.'],
        details: `Path: ${artifactPath}`,
      };
    }

    // 2. Read file content
    let rawContent = '';
    try {
      rawContent = readFileSync(artifactPath, 'utf8').trim();
    } catch (err) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Unable to read script file.'],
        details: err instanceof Error ? err.message : String(err),
      };
    }

    // 3. Verify file is not empty
    if (!rawContent) {
      return {
        guardName: this.guardName,
        targetStep: this.targetStep,
        status: 'fail',
        severity: 'blocking',
        reasons: ['Script file is empty.'],
      };
    }

    // 4. Try parsing as JSON or falling back to plain text
    let scriptText = '';
    let isJson = false;

    try {
      const parsed = JSON.parse(rawContent);
      isJson = true;

      // Schema checks
      if (parsed && typeof parsed === 'object') {
        // Look for typical content fields: script, voiceover, blocks, etc.
        if (parsed.script && typeof parsed.script === 'string') {
          scriptText = parsed.script;
        } else if (parsed.voiceover && typeof parsed.voiceover === 'string') {
          scriptText = parsed.voiceover;
        } else if (Array.isArray(parsed.blocks)) {
          // Reconstruct blocks if available
          scriptText = parsed.blocks
            .map((b: any) => b.text || b.voiceover || '')
            .join(' ')
            .trim();
        } else if (parsed.content && typeof parsed.content === 'string') {
          scriptText = parsed.content;
        } else {
          reasons.push('JSON schema does not contain a recognized script content field ("script", "voiceover", "blocks", "content").');
        }
      } else {
        reasons.push('Parsed JSON is not a valid object schema.');
      }
    } catch {
      // Fallback to raw text validation
      scriptText = rawContent;
    }

    // 5. Length verification
    if (scriptText.length < this.minCharacters) {
      reasons.push(`Script content is too short: got ${scriptText.length} characters, expected >= ${this.minCharacters}.`);
    } else if (scriptText.length > this.maxCharacters) {
      // Short videos warning vs block
      if (scriptText.length > this.maxCharacters * 1.5) {
        reasons.push(`Script content length ${scriptText.length} severely exceeds threshold limit of ${this.maxCharacters}.`);
      } else {
        // Warning only
        return {
          guardName: this.guardName,
          targetStep: this.targetStep,
          status: 'warn',
          severity: 'warning',
          reasons: [`Script content is slightly long (${scriptText.length} > target ${this.maxCharacters}).`],
          details: `Content excerpt: ${scriptText.substring(0, 100)}...`,
        };
      }
    }

    // 6. Banned words verification
    const lowerText = scriptText.toLowerCase();
    for (const banned of this.bannedPhrases) {
      if (lowerText.includes(banned.toLowerCase())) {
        reasons.push(`Script contains disallowed phrase: "${banned}".`);
      }
    }

    // 7. Determine final status
    const hasFailures = reasons.length > 0;
    return {
      guardName: this.guardName,
      targetStep: this.targetStep,
      status: hasFailures ? 'fail' : 'pass',
      severity: hasFailures ? 'blocking' : 'info',
      reasons,
      details: hasFailures
        ? `Fail reasons: ${reasons.join(' | ')}`
        : `Validated successfully. Format: ${isJson ? 'JSON' : 'Plain Text'}. Length: ${scriptText.length} chars.`,
    };
  }
}
