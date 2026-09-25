import { describe, expect, it } from 'vitest';

import { conciseElementLabel } from './captures';

describe('conciseElementLabel', () => {
  it('turns a long legacy paragraph label into a semantic name', () => {
    const legacyLabel = 'A selected paragraph whose full body copy was historically stored as its element label and is much too long to use as a reference title';

    expect(conciseElementLabel(legacyLabel, 'p', 'p')).toBe('Text block');
  });

  it('uses heading semantics when a long accessible name came from heading text', () => {
    const heading = 'A deliberately long editorial heading that should remain available as captured text without becoming the detail page title';

    expect(conciseElementLabel(heading, 'heading', 'h2')).toBe('Heading');
  });

  it('preserves a concise, useful accessible name', () => {
    expect(conciseElementLabel('Start a project', 'button', 'button')).toBe('Start a project');
  });
});
