async (page) => {
  /* probe-zoom2.js —— 验证 zoom 挂在 overlay 子元素时 .panel 是否仍居中（CSS 补偿策略前提） */
  const out = {};
  const ctx = await page.context().browser().newContext({ viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.LG && document.querySelector('.menu-panel')), null, { timeout: 20000 });
  await p.waitForTimeout(700);
  out.center = await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#overlay > * { zoom: 3; }';
    document.head.appendChild(st);
    const panel = document.querySelector('.menu-panel');
    const r = panel.getBoundingClientRect();
    const expectLeft = (innerWidth - r.width) / 2;
    st.remove();
    return { left: r.width, w: r.width, ih: innerWidth, expectLeft, gotLeft: r.left, dx: r.left - expectLeft };
  });
  // 修上面的笔误字段（left 存错），重新取一次
  out.center2 = await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#overlay > * { zoom: 3; }';
    document.head.appendChild(st);
    const r = document.querySelector('.menu-panel').getBoundingClientRect();
    const expectLeft = (innerWidth - r.width) / 2;
    st.remove();
    return { gotLeft: r.left, expectLeft, dx: Math.abs(r.left - expectLeft), iw: innerWidth, w: r.width };
  });
  // zoom 属性接受 var() 吗
  out.varZoom = await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = ':root { --fs: 2; } #overlay > * { zoom: var(--fs); }';
    document.head.appendChild(st);
    const ok = getComputedStyle(document.querySelector('.menu-panel')).zoom;
    st.remove();
    return ok;
  });
  await ctx.close();
  return out;
}
