/** Keep chronological DOM/tab order while placing each card in the shortest column. */
export function mountMasonry(grid: HTMLElement): { refresh(): void; destroy(): void } {
  let frame = 0;
  let lastWidth = 0;
  let disposed = false;
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(layout);
  };
  const observer = new ResizeObserver(entries => {
    if (entries.some(entry => entry.target !== grid || entry.contentRect.width !== lastWidth)) schedule();
  });
  function layout() {
    frame = 0;
    const width = grid.clientWidth;
    if (!width) return;
    lastWidth = width;
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 16;
    const minimum = 18 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const columns = Math.max(1, Math.floor((width + gap) / (minimum + gap)));
    const cardWidth = (width - gap * (columns - 1)) / columns;
    const cards = [...grid.children] as HTMLElement[];
    grid.classList.add('is-masonry');
    for (const card of cards) card.style.width = `${cardWidth}px`;
    const heights = cards.map(card => card.getBoundingClientRect().height);
    const bottoms = Array<number>(columns).fill(0);
    cards.forEach((card, index) => {
      const column = bottoms.indexOf(Math.min(...bottoms));
      card.style.insetInlineStart = `${column * (cardWidth + gap)}px`;
      card.style.top = `${bottoms[column]}px`;
      bottoms[column] = bottoms[column]! + heights[index]! + gap;
    });
    grid.style.height = `${Math.max(0, ...bottoms) - (cards.length ? gap : 0)}px`;
  }
  function refresh() {
    if (disposed) return;
    observer.disconnect();
    observer.observe(grid);
    for (const card of grid.children) observer.observe(card);
    layout();
  }
  return {
    refresh,
    destroy() {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
