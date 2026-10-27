import * as ImageManipulator from 'expo-image-manipulator';

const DEFAULT_MAX_BYTES = 3_000_000;

const LADDER = [
  { width: 1280, compress: 0.82 },
  { width: 1024, compress: 0.78 },
  { width: 832, compress: 0.74 },
  { width: 640, compress: 0.7 },
  { width: 512, compress: 0.65 },
] as const;

export function stripDataUriPrefix(b64: string): string {
  if (!b64.startsWith('data:')) return b64;
  const comma = b64.indexOf(',');
  return comma === -1 ? b64 : b64.slice(comma + 1);
}

function base64ByteLength(b64: string): number {
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Resize an Expo image URI into a raw-base64 JPEG that fits inside the
 * gateway request-body limit for image-input requests.
 */
export async function resizeForUpload(
  imageUri: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  for (const step of LADDER) {
    try {
      const saved = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: step.width } }],
        {
          format: ImageManipulator.SaveFormat.JPEG,
          compress: step.compress,
          base64: true,
        },
      );

      if (saved.base64 && base64ByteLength(saved.base64) <= maxBytes) {
        return {
          base64: stripDataUriPrefix(saved.base64),
          mimeType: 'image/jpeg',
        };
      }
    } catch (manipulatorError) {
      console.log('[ShadowFrame Resize]', 'Resize step failed', step.width, manipulatorError);
    }
  }

  // Fallback: use the original bytes if they already fit the budget.
  if (imageUri.startsWith('data:')) {
    const raw = stripDataUriPrefix(imageUri);
    if (base64ByteLength(raw) <= maxBytes) {
      return { base64: raw, mimeType: 'image/jpeg' };
    }
  }

  throw new Error('IMAGE_TOO_LARGE');
}
