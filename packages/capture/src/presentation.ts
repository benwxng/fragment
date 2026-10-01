const semanticNames: Record<string, string> = {
  article: 'Article',
  button: 'Button',
  checkbox: 'Checkbox',
  complementary: 'Sidebar',
  contentinfo: 'Footer',
  form: 'Form',
  heading: 'Heading',
  img: 'Image',
  link: 'Link',
  list: 'List',
  main: 'Main content',
  navigation: 'Navigation',
  radio: 'Radio button',
  textbox: 'Text field',
  aside: 'Sidebar',
  div: 'Container',
  footer: 'Footer',
  header: 'Header',
  input: 'Input',
  li: 'List item',
  nav: 'Navigation',
  ol: 'List',
  p: 'Text block',
  section: 'Section',
  select: 'Select',
  span: 'Text',
  table: 'Table',
  textarea: 'Text field',
  ul: 'List',
};

/** Keep reference names scannable; the full captured copy remains in textExcerpt. */
export function conciseElementLabel(label: string, role: string, tagName = ''): string {
  const cleanLabel = label.replace(/\s+/gu, ' ').trim();
  const words = cleanLabel.split(/\s+/u).filter(Boolean);
  if (cleanLabel && cleanLabel.length <= 40 && words.length <= 6) return cleanLabel;
  if (/^h[1-6]$/u.test(tagName)) return 'Heading';
  return semanticNames[role.toLocaleLowerCase()]
    ?? semanticNames[tagName.toLocaleLowerCase()]
    ?? 'Saved element';
}

export function formatCaptureDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export const libraryFilters = [['all', 'All'], ['typography', 'Type'], ['component', 'Components'], ['color', 'Colors'], ['layout', 'Layout']] as const;
export type LibraryFilter = typeof libraryFilters[number][0];

export const libraryEmptyCopy = 'Use the Glance inspector to save a reference to your account. Your library is shared across the web and extension.';
