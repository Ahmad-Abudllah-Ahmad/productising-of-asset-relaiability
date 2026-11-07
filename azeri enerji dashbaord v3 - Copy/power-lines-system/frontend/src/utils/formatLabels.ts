import { type Language, translate, translateDetectionClassKey } from "../i18n/translations";

/**
 * Format detection labels for display
 * Replaces common variations and formats text properly
 */
export function formatDetectionLabel(label: string | undefined | null, language: Language = "en"): string {
  if (!label) return translate(language, "detectionClass.unknown");
  return translateDetectionClassKey(language, label);
}
