import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitizes raw CSS to prevent XSS attacks when injecting into <style> tags.
 * Crucially removes closing </style> tags to prevent HTML context breakout.
 */
export function sanitizeCSS(css: string | undefined | null): string {
  if (!css) return "";
  
  let sanitized = css;
  // 1. Prevent HTML context breakout (critical for dangerouslySetInnerHTML)
  sanitized = sanitized.replace(/<\/\s*style\s*>/gi, "");
  
  // 2. Prevent obsolete but dangerous CSS vectors
  sanitized = sanitized.replace(/expression\s*\(/gi, "no-expression(");
  sanitized = sanitized.replace(/url\s*\(\s*['"]?javascript:/gi, "url(");
  sanitized = sanitized.replace(/behavior\s*:/gi, "no-behavior:");
  sanitized = sanitized.replace(/-moz-binding\s*:/gi, "no-binding:");
  
  return sanitized;
}
