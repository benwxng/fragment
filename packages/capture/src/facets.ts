import type { CaptureFacet, ElementSnapshot } from './types';

function hasVisibleValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'none' && normalized !== 'normal' && normalized !== '0px' && normalized !== '0';
}

function hasSides(values: { top: string; right: string; bottom: string; left: string }): boolean {
  return [values.top, values.right, values.bottom, values.left].some(hasVisibleValue);
}

/** Derives browse facets from captured visual evidence in a deterministic order. */
export function inferFacets(snapshot: ElementSnapshot): CaptureFacet[] {
  const facets: CaptureFacet[] = [];
  const hasTypography = Boolean(snapshot.textExcerpt && snapshot.typography.fontFamily.trim());
  const hasComponent = Boolean(
    snapshot.semantic.role ||
      snapshot.semantic.tagName !== 'span' ||
      hasSides(snapshot.box.padding) ||
      Object.values(snapshot.box.radius).some(hasVisibleValue) ||
      hasVisibleValue(snapshot.effects.boxShadow),
  );
  const hasColor = Boolean(
    snapshot.colors.text.trim() ||
      snapshot.colors.background.trim() ||
      snapshot.colors.effectiveBackground.trim() ||
      snapshot.colors.borderTop.trim() ||
      snapshot.colors.borderRight.trim() ||
      snapshot.colors.borderBottom.trim() ||
      snapshot.colors.borderLeft.trim(),
  );
  const hasLayout = Boolean(
    snapshot.rect.width > 0 ||
      snapshot.rect.height > 0 ||
      hasSides(snapshot.box.margin) ||
      hasSides(snapshot.box.padding) ||
      ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(snapshot.layout.display),
  );

  if (hasTypography) facets.push('typography');
  if (hasComponent) facets.push('component');
  if (hasColor) facets.push('color');
  if (hasLayout) facets.push('layout');
  return facets;
}
