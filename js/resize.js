/* ASTRA Terminal — draggable dividers.
   The chart, each indicator window and the lower workspace can all be resized by
   dragging the line between them. Sizes are remembered per browser. */
const Resize = {
  sizes: lsGet('astra_paneSizes', {}),

  init(){
    for (const key of ['p1', 'p2', 'p3']) this.attachPane(key);
    this.attachBottom();
    this.apply();
  },

  apply(){
    for (const key of ['p1', 'p2', 'p3']){
      const el = document.getElementById('pane-' + key);
      if (el && this.sizes[key]) el.style.height = this.sizes[key] + 'px';
    }
    const bp = document.getElementById('bottomPanel');
    if (bp && this.sizes.bottom) bp.style.height = this.sizes.bottom + 'px';
  },

  save(){ lsSet('astra_paneSizes', this.sizes); },

  /* a thin grip on the top edge of an indicator window */
  attachPane(key){
    const el = document.getElementById('pane-' + key);
    if (!el || el.querySelector('.paneGrip')) return;
    const grip = document.createElement('div');
    grip.className = 'paneGrip';
    grip.title = 'Drag to resize this window';
    el.appendChild(grip);
    this.drag(grip, () => el.getBoundingClientRect().height, (h) => {
      const v = Math.max(60, Math.min(460, h));
      el.style.height = v + 'px';
      this.sizes[key] = Math.round(v);
    }, -1);
  },

  /* The lower panel — Screener, Heatmap, Observer, Intel, News, and the Market
     Clock and Trade Replay in their normal state — is resized by the bar on its
     top edge.

     ⚠ That bar used to live INSIDE the panel, and the panel has overflow:hidden,
     so three of its six pixels were clipped away and the tab strip sat on top of
     the rest: about 3 px could actually be hit, which is why dragging "did not
     work". It is now a bar of its own between the charts and the panel, 10 px
     tall, so it can be grabbed anywhere along its width. */
  attachBottom(){
    const bp = document.getElementById('bottomPanel');
    if (!bp || !bp.parentElement) return;
    if (bp.parentElement.querySelector(':scope > .bottomGrip')) return;
    const old = bp.querySelector(':scope > .paneGrip');
    if (old) old.remove();                       // the clipped one from before
    const grip = document.createElement('div');
    grip.className = 'paneGrip bottomGrip';
    grip.title = 'Drag to make the lower panel taller or shorter (double-click to fold it away)';
    bp.parentElement.insertBefore(grip, bp);
    grip.addEventListener('dblclick', () => {
      bp.classList.toggle('collapsed');
      window.dispatchEvent(new Event('resize'));
    });
    this.drag(grip, () => bp.getBoundingClientRect().height, (h) => {
      const v = Math.max(37, Math.min(window.innerHeight - 220, h));
      bp.style.height = v + 'px';
      bp.classList.remove('collapsed');
      this.sizes.bottom = Math.round(v);
    }, -1);
  },

  /* Shared drag behaviour; `sign` is -1 because dragging up must grow a panel
     whose grip sits on its top edge. Pointer events with capture, so the drag
     survives the cursor leaving the bar or the window — and so it works with a
     finger on a touch screen too. */
  drag(grip, getH, setH, sign){
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const startY = e.clientY, startH = getH();
      document.body.classList.add('resizing');
      try { grip.setPointerCapture(e.pointerId); } catch(err){}
      const move = ev => setH(startH + sign * (ev.clientY - startY));
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        try { grip.releasePointerCapture(e.pointerId); } catch(err){}
        document.body.classList.remove('resizing');
        this.save();
        window.dispatchEvent(new Event('resize'));
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  },
};
