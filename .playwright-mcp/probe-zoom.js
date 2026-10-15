async (page) => {
  /* probe-zoom.js —— 探测 CSS zoom 在 #overlay 上对 vw/vh 尺寸规则的实际行为（面板补偿策略依据） */
  const out = {};
  const ctx = await page.context().browser().newContext({ viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.LG && document.querySelector('.menu-panel')), null, { timeout: 20000 });
  await p.waitForTimeout(700);
  out.base = await p.evaluate(() => {
    const panel = document.querySelector('.menu-panel');
    const r = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    return { w: r.width, h: r.height, maxWidth: cs.maxWidth, minWidth: cs.minWidth, iw: innerWidth, ih: innerHeight };
  });
  // A: zoom 挂在 #overlay 本体
  out.a = await p.evaluate(() => {
    const ov = document.getElementById('overlay');
    ov.style.zoom = '3';
    const panel = document.querySelector('.menu-panel');
    const r = panel.getBoundingClientRect();
    const btn = document.querySelector('.menu-btns .btn');
    const br = btn.getBoundingClientRect();
    const ovR = ov.getBoundingClientRect();
    ov.style.zoom = '';
    return { panelW: r.width, panelH: r.height, btnW: br.width, btnH: br.height,
             fontPx: getComputedStyle(btn).fontSize, ovW: ovR.width, ovH: ovR.height };
  });
  // B: zoom 挂在 overlay 直接子元素
  out.b = await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#overlay > * { zoom: 3; }';
    document.head.appendChild(st);
    const panel = document.querySelector('.menu-panel');
    const r = panel.getBoundingClientRect();
    const btn = document.querySelector('.menu-btns .btn');
    const br = btn.getBoundingClientRect();
    st.remove();
    return { panelW: r.width, panelH: r.height, btnW: br.width, btnH: br.height,
             fontPx: getComputedStyle(btn).fontSize };
  });
  await ctx.close();
  return out;
}
