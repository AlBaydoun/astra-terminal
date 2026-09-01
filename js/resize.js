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

  attachBottom(){
    const bp = document.getElementById('bottomPanel');
    if (!bp || bp.querySelector('.paneGrip')) return;
    const grip = document.createElement('div');
    grip.className = 'paneGrip bottomGrip';
    grip.title = 'Drag to resize the lower panel';
    bp.appendChild(grip);
    this.drag(grip, () => bp.getBoundingClientRect().height, (h) => {
      const v = Math.max(37, Math.min(window.innerHeight - 220, h));
      bp.style.height = v + 'px';
      bp.classList.remove('collapsed');
      this.sizes.bottom = Math.round(v);
    }, -1);
  },

  /* shared drag behaviour; `sign` is -1 because dragging up must grow a panel
     whose grip sits on its top edge */
  drag(grip, getH, setH, sign){
    grip.addEventListener('mousedown', e => {
      e.preventDefault();
      const startY = e.clientY, startH = getH();
      document.body.classList.add('resizing');
      const move = ev => setH(startH + sign * (ev.clientY - startY));
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        this.save();
        window.dispatchEvent(new Event('resize'));
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  },
};
