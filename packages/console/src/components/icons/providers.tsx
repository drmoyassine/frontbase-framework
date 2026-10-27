/**
 * Provider Brand Icons — Zero-config auto-discovery.
 *
 * Just drop a `{provider_key}.svg` into this folder and it automatically
 * overrides the Lucide fallback in PROVIDER_ICONS. No imports needed.
 *
 * The filename must match the provider key in edgeConstants.tsx
 * (e.g. "vercel.svg" for the "vercel" key, "supabase.svg" for "supabase").
 */

import React from 'react';

// ── Auto-discover all .svg files in this directory (Vite glob import) ──
const svgModules = import.meta.glob<string>('./*.svg', { eager: true, import: 'default' });

interface BrandIconProps {
  className?: string;
}

function makeBrandIcon(src: string, alt: string): React.FC<BrandIconProps> {
  const BrandIcon: React.FC<BrandIconProps> = ({ className = 'h-4 w-4' }) => (
    <img src={src} alt={alt} className={className} style={{ objectFit: 'contain' }} />
  );
  BrandIcon.displayName = `${alt}Icon`;
  return BrandIcon;
}

/**
 * Auto-built map of provider key → brand icon component.
 * Derived from all .svg files in src/components/icons/.
 * e.g. "./supabase.svg" → { supabase: SupabaseIcon }
 */
export const BRAND_ICONS: Record<string, React.FC<BrandIconProps>> = {};

for (const [path, src] of Object.entries(svgModules)) {
  // "./supabase.svg" → "supabase"
  const key = path.replace('./', '').replace('.svg', '');
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  BRAND_ICONS[key] = makeBrandIcon(src, label);
}
