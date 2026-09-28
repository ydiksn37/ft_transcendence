export const isSixDigitCode = (value: string): boolean => /^\d{6}$/.test(value);

export const validateEmail = (value: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return 'Email is required.';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Enter a valid email address.';
  }
  return null;
};

export const validateLength = (
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string | null => {
  const length = value.trim().length;
  if (length < minimum || length > maximum) {
    return `${label} must be ${minimum}-${maximum} characters.`;
  }
  return null;
};

export const parseBoundedInteger = (
  value: string,
  minimum: number,
  maximum: number,
): number | null => {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
};
