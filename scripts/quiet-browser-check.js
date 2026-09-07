// Playwright CLI run-code function. Run on an already opened MedLens page.
// Screenshots are local QA artifacts; no dataset or session writes.
async (page) => {
  const base=await page.evaluate(()=>new URL('./',location.href).href);
  const urea='OB-RB-448EA2EDCA681953',study='EV-ST-789A626F61C2F893';
  const checks=[],errors=[];
  const errorListener=e=>errors.push(e.message);
  page.on('pageerror',errorListener);
  const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
  const settle=()=>page.waitForTimeout(500);
  const geometry=()=>page.locator('.lens').evaluate(el=>{
    const b=el.getBoundingClientRect(),c=el.querySelector('.lens-boundary');
    return [b.width,b.height,c.getAttribute('cx'),c.getAttribute('cy'),c.getAttribute('r')];
  });
  const focus=()=>page.locator('.lens-view').getAttribute('data-focus-caption');
  const reader=()=>page.locator('.focus-rail').getAttribute('data-reader-object');
  const search=async(text,id)=>{
    await page.getByRole('searchbox',{name:'Пошук у всьому досьє'}).fill(text);
    await page.locator(`.search-results-list [data-select-object="${id}"]`).click();
    await settle();
  };
  const more=()=>page.locator('.more-control > summary').click();
  const panTo=async(id)=>{
    const d=await page.locator(`[data-lens-node="${id}"]`).evaluate(el=>{
      const s=el.ownerSVGElement,b=s.getBoundingClientRect(),t=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');
      return {x:b.x+t.e,y:b.y+t.f,dx:Number(c.getAttribute('cx'))-t.e,dy:Number(c.getAttribute('cy'))-t.f};
    });
    await page.mouse.move(d.x,d.y);await page.mouse.down();
    await page.mouse.move(d.x+d.dx,d.y+d.dy,{steps:22});
    await page.waitForTimeout(220); // A stable target commits while still dragging.
    check(await focus()===id&&await reader()===id,'Reader follows during drag: '+id);
    await page.mouse.up();await page.waitForTimeout(100);
    check(await focus()===id&&await reader()===id,'Reader follows after drag: '+id);
  };
  try {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(base);await page.locator('.lens-boundary').waitFor();await settle();
    check(await page.locator('.lens-key,.lens-compass,.lens-orientation,.graph-foot,.rail-tabs,.pinned-stripe').count()===0,'Removed chrome absent');
    await page.screenshot({path:'output/playwright/quiet-check-desktop.png'});
    const measurements=[];
    for(const size of [{width:1440,height:900},{width:1000,height:1000},{width:390,height:844}]){
      await page.setViewportSize(size);await page.waitForTimeout(150);
      const closed=await geometry();
      await page.getByRole('button',{name:'Дані',exact:true}).click();const open=await geometry();
      await page.getByRole('button',{name:'Час',exact:true}).click();const timed=await geometry();
      check(JSON.stringify(closed)===JSON.stringify(open)&&JSON.stringify(closed)===JSON.stringify(timed),'Constant canvas and circle: '+size.width);
      await page.getByRole('button',{name:'Закрити час'}).click();
      await page.getByRole('button',{name:'Закрити запис',exact:true}).click();
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow: '+size.width);
      measurements.push({viewport:size,closed,reader:open,time:timed});
    }
    await page.setViewportSize({width:1440,height:900});
    await search('Біохімічний',study);
    await panTo(urea);
    const body=await page.locator('.focus-rail').innerText();
    check(await page.locator('.rail-header h2').innerText()==='Сечовина','Urea title');
    check(/4,2/.test(body)&&body.includes('ммоль/л')&&body.includes('2.1–7.1')&&body.includes('19.08.2026 · видано')&&body.includes('кров'),'Exact Urea fields');
    check(await page.locator('.focus-rail .record-insights,.focus-rail .node-row,.focus-rail .rail-tabs').count()===0,'No unrelated records or technical extras by default');
    const g=await geometry();
    await page.screenshot({path:'output/playwright/quiet-check-urea.png'});
    await page.locator('.reader-sources > summary').click();
    await page.locator('[data-source-id="SR-0845FEA2BE58-P0028"]').click();
    check((await page.locator('.source-text').innerText()).includes('Сечовина: 4.2 ммоль/л; референс 2.1–7.1.'),'Exact Urea source');
    check(JSON.stringify(g)===JSON.stringify(await geometry()),'Source does not resize lens');
    await page.screenshot({path:'output/playwright/quiet-check-source.png'});
    await more();await page.getByRole('button',{name:'Зв’язки запису',exact:true}).click();
    check(await page.locator('.source-text').count()===0&&await page.locator('.link-row').count()>0,'Links replace the source on demand');
    check(JSON.stringify(g)===JSON.stringify(await geometry()),'Links do not resize lens');
    await page.getByRole('button',{name:'До даних',exact:true}).click();
    await more();await page.getByRole('button',{name:'Технічні дані запису',exact:true}).click();
    check(await page.locator('.record-insights').count()>0,'Technical details remain available on demand');
    check(JSON.stringify(g)===JSON.stringify(await geometry()),'Technical details do not resize lens');
    await page.locator('.study-return').click();await settle();
    check(await page.locator('.record-insights,.source-text').count()===0,'New focus clears old source and technical details');
    await panTo(urea);
    await page.getByRole('button',{name:'Закрити запис',exact:true}).click();
    await page.getByRole('button',{name:'Усі результати · 18',exact:true}).click();
    check(await page.locator('.lens-coverage-content li').count()===18,'All 18 biochemistry results reachable');
    check(JSON.stringify(g)===JSON.stringify(await geometry()),'Full result list does not resize lens');
    await page.getByRole('button',{name:'Закрити перелік',exact:true}).click();
    await page.locator('.lens-svg').focus();await page.keyboard.press('ArrowLeft');await settle();
    check(await focus()==='SP-SM-E03CD2A92B34836D','Keyboard parent navigation');
    await page.keyboard.press('Enter');await settle();
    check(await reader()===await focus()&&await page.locator('.focus-rail').isVisible(),'Keyboard opens the focused record');
    await search('Сечовина',urea);
    await page.setViewportSize({width:390,height:844});await settle();
    await page.screenshot({path:'output/playwright/quiet-check-mobile-reader.png'});
    await page.getByRole('button',{name:'Закрити запис',exact:true}).click();
    await page.screenshot({path:'output/playwright/quiet-check-mobile.png'});
    await page.setViewportSize({width:1440,height:900});await more();
    await page.getByRole('button',{name:'Таблиця',exact:true}).click();await more();
    check(await page.locator('[data-graph-object]').count()===185,'Table retains all 185 graph objects');
    check(await page.getByRole('columnheader',{name:'Відбір A',exact:true}).count()===0,'Table comparison removed');
    await page.screenshot({path:'output/playwright/quiet-check-table.png'});
    await more();await page.getByRole('button',{name:'Лінза',exact:true}).click();await more();await settle();
    await page.getByRole('button',{name:'Час',exact:true}).click();
    await page.locator('input[aria-label="Кінцева дата відбору"]').fill('2026-05-22');
    check(await page.evaluate(()=>new URL(location.href).searchParams.get('date'))==='2026-05-22','Date cutoff applied');
    await page.getByRole('button',{name:'Закрити час'}).click();
    await search('Сечовина',urea);
    check(await focus()===urea&&await reader()===urea,'Explicit search opens the requested out-of-scope record');
    check(await page.evaluate(()=>new URL(location.href).searchParams.has('date'))===false,'Out-of-scope read visibly resets cutoff');
    await page.getByRole('button',{name:'Час',exact:true}).click();
    await page.getByRole('button',{name:'Усі дати',exact:true}).click();
    await page.getByRole('button',{name:'Закрити час'}).click();
    for(const mode of ['dual','lab']){
      await page.goto(base+'?lens='+mode);await page.locator('.lens-boundary').waitFor();await settle();
      check(await page.locator('.exp-linked-lenses,.exp-lab-panes,iframe').count()===0,'Retired route returns to lens: '+mode);
    }
    check(errors.length===0,'No page errors');
    return {status:'PASS',checks,measurements,errors};
  } finally {page.off('pageerror',errorListener);}
}
