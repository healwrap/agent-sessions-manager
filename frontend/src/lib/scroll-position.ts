const anchors = '[data-scroll-anchor], [data-message-ref], [data-ref]';

function anchorKey(row: HTMLElement) {
  return row.dataset.scrollAnchor || row.dataset.messageRef || row.dataset.ref;
}

// Keep a visible record in place when history, images or disclosures change size.
// Managed panes disable browser anchoring so there is only one compensation.
export class ScrollPosition {
  top = 0;
  height = 0;
  clientHeight = 0;
  following = false;
  private anchor: { node: HTMLElement; key: string; offset: number } | null =
    null;
  private disclosure: { node: HTMLElement; offset: number } | null = null;

  constructor(readonly pane: HTMLElement) {}

  get maximum() {
    return Math.max(0, this.pane.scrollHeight - this.pane.clientHeight);
  }

  move(top: number) {
    const target = Math.max(0, Math.min(top, this.maximum));
    if (Math.abs(this.pane.scrollTop - target) > 0.5)
      this.pane.scrollTop = target;
  }

  holdDisclosure(node: HTMLElement) {
    this.following = false;
    this.disclosure = {
      node,
      offset:
        node.getBoundingClientRect().top -
        this.pane.getBoundingClientRect().top -
        this.pane.clientTop,
    };
  }

  releaseDisclosure() {
    this.disclosure = null;
  }

  restoreDisclosure() {
    const anchor = this.disclosure;
    this.releaseDisclosure();
    if (!anchor || !this.pane.contains(anchor.node)) return false;
    const offset =
      anchor.node.getBoundingClientRect().top -
      this.pane.getBoundingClientRect().top -
      this.pane.clientTop;
    this.move(this.pane.scrollTop + offset - anchor.offset);
    return true;
  }

  capture() {
    const pane = this.pane;
    this.top = Math.max(0, Math.min(pane.scrollTop, this.maximum));
    this.height = pane.scrollHeight;
    this.clientHeight = pane.clientHeight;
    const rows = pane.querySelectorAll<HTMLElement>(anchors);
    const top = pane.getBoundingClientRect().top + pane.clientTop;
    // Records are ordered, so locate the first visible one without measuring all.
    let low = 0,
      high = rows.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (rows[middle].getBoundingClientRect().bottom <= top) low = middle + 1;
      else high = middle;
    }
    const node = rows[low],
      key = node && anchorKey(node);
    this.anchor =
      node && key
        ? { node, key, offset: node.getBoundingClientRect().top - top }
        : null;
  }

  restore() {
    if (this.restoreDisclosure()) return;
    const pane = this.pane,
      anchor = this.anchor;
    const node =
      anchor &&
      (pane.contains(anchor.node)
        ? anchor.node
        : Array.from(pane.querySelectorAll<HTMLElement>(anchors)).find(
            (row) => anchorKey(row) === anchor.key,
          ));
    if (anchor && node) {
      const offset =
        node.getBoundingClientRect().top -
        pane.getBoundingClientRect().top -
        pane.clientTop;
      this.move(pane.scrollTop + offset - anchor.offset);
    } else this.move(this.top);
  }

  trackScroll() {
    // Shrinking content can clamp scrollTop before our resize compensation.
    if (this.disclosure) return 0;
    const top = Math.max(0, Math.min(this.pane.scrollTop, this.maximum));
    const direction = Math.sign(top - this.top);
    if (direction < 0) this.following = false;
    else if (direction > 0 && this.maximum - top <= 2) this.following = true;
    this.capture();
    return direction;
  }

  ownsScrollInput(input: EventTarget | null) {
    let target = input instanceof Element ? input : null;
    while (target && target !== this.pane) {
      if (
        target.scrollHeight > target.clientHeight + 1 &&
        /auto|scroll/.test(getComputedStyle(target).overflowY)
      )
        return false;
      target = target.parentElement;
    }
    return target === this.pane;
  }

  pauseOnUpwardInput = (event: WheelEvent) => {
    if (
      event.deltaY < 0 &&
      !event.ctrlKey &&
      !event.shiftKey &&
      this.maximum &&
      this.ownsScrollInput(event.target)
    )
      this.following = false;
  };

  pauseOnUpwardKey = (event: KeyboardEvent) => {
    if (!['ArrowUp', 'PageUp', 'Home'].includes(event.key)) return;
    if (
      event.target instanceof Element &&
      event.target.closest('input, textarea, [contenteditable="true"]')
    )
      return;
    this.following = false;
  };
}
