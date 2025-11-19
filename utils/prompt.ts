import { Platform } from 'react-native';

export type EditMode = 'single' | 'merge';

export interface SanitizedPromptResult {
  sanitizedPrompt: string;
  warnings: string[];
  wasModified: boolean;
}

const fallbackPrompts: Record<EditMode, string> = {
  single: 'Enhance the scene with cinematic lighting, vibrant contrast, and a refined color grade.',
  merge: 'Blend both photos into an artistic double-exposure with complementary lighting and smooth transitions.',
};

const patternReplacements: {
  regex: RegExp;
  replacement: string;
  warning: string;
}[] = [
  {
    regex: /\bface\s*swap(?:s|ping|ped)?\b/gi,
    replacement:
      'blend both subjects into a cohesive artistic composition with balanced lighting and texture',
    warning: 'Removed face swap phrasing to keep the request compliant with safety filters.',
  },
  {
    regex: /\bswap\b[^.]{0,60}\bface(?:s)?\b/gi,
    replacement:
      'create a harmonious composite that mixes stylistic elements from both images naturally',
    warning: 'Adjusted face replacement wording to avoid identity manipulation cues.',
  },
  {
    regex: /\breplace\b[^.]{0,60}\bface(?:s)?\b/gi,
    replacement:
      'reinterpret the subject with artistic cues borrowed from the other image',
    warning: 'Adjusted replace-face language to keep edits stylistic rather than identity-based.',
  },
  {
    regex: /\bdeep\s*fak(?:e|ing|ed)?\b/gi,
    replacement: 'stylized reinterpretation',
    warning: 'Removed deepfake references that violate content policy.',
  },
  {
    regex: /\b(?:identity|identities)\b[^.]{0,60}\b(change|swap|replace)\b/gi,
    replacement: 'stylized transformation focusing on lighting, mood, and artistic tone',
    warning: 'Adjusted identity alteration phrasing to focus on stylistic changes.',
  },
];

const identityNameRegex = /\b(?:look\s+like|as|become|transform(?:ed)?\s+into)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\b/g;
const explicitNameRegex = /\b(?:celebrity|celeb|influencer|famous person|public figure)\b/gi;

export function sanitizePrompt(input: string, mode: EditMode): SanitizedPromptResult {
  let sanitized = input.trim();
  const warnings: string[] = [];

  patternReplacements.forEach(({ regex, replacement, warning }) => {
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, replacement);
      warnings.push(warning);
    }
  });

  if (identityNameRegex.test(sanitized)) {
    sanitized = sanitized.replace(
      identityNameRegex,
      'a stylized fictional character with distinct lighting and mood'
    );
    warnings.push('Removed direct identity references to keep the request stylistic.');
  }

  if (explicitNameRegex.test(sanitized)) {
    sanitized = sanitized.replace(
      explicitNameRegex,
      'artistic subject'
    );
    warnings.push('Adjusted celebrity references to neutral artistic subjects.');
  }

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (!sanitized || sanitized.length < 8) {
    sanitized = fallbackPrompts[mode];
    warnings.push('Prompt was too short after sanitization. Applied a safe creative fallback.');
  }

  const lower = sanitized.toLowerCase();
  if (Platform.OS === 'web' && lower.includes('hdr')) {
    sanitized = sanitized.replace(/\bhdr\b/gi, 'high dynamic range inspired');
    warnings.push('Rephrased HDR to improve compatibility with the web toolchain.');
  }

  const dedupedWarnings = Array.from(new Set(warnings));

  return {
    sanitizedPrompt: sanitized,
    warnings: dedupedWarnings,
    wasModified: dedupedWarnings.length > 0,
  };
}
