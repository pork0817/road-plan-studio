// Shared building blocks for country presets: the property panels (fields) for every element type, filled in with
// each country's regulation values and wording. A country passes:
//   K.lineStyles, K.crosswalk, K.stopLine, K.centerTypes, K.arrowKinds, K.colorOpts, K.sidewalkStyles, K.surfaceKinds
//   K.T   — wording / law notes (see the keys used below; anything missing is simply left out)
//   K.own — { type: (el) => fields } to replace a whole panel for one element type
window.RoadPresetKit = (function () {
  const num = (key, label, min, max, step, law) => ({ kind: 'num', key, label, min, max, step, unit: 'm', law });
  const law = (text) => (text ? [{ kind: 'law', text }] : []);
  const info = (text) => (text ? [{ kind: 'info', text }] : []);

  function makeFields(K) {
    const T = K.T || {};
    const cwOpts = Object.entries(K.crosswalk).map(([k, v]) => [k, v.label || v.name]);
    const junctionCross = (el) => {
      const kind = K.crosswalk[el.cwKind] ? el.cwKind : Object.keys(K.crosswalk)[0], spec = K.crosswalk[kind];
      return [
        { kind: 'chk', key: 'crosswalks', label: '自動行人穿越道 Crosswalks' },
        ...(el.crosswalks !== false ? [{ kind: 'sel', key: 'cwKind', label: '型式 Type', options: cwOpts },
          num('cwWidth', '穿越道寬 Width', spec.width.min, spec.width.max, 0.1, T.cwWidth || `${spec.width.min}–${spec.width.max} m`)]
          : info('關閉時，停止線會放在您自己畫的行人穿越道後方。With crosswalks off, stop lines go behind the crosswalks you drew yourself.')),
        num('setback', '退縮 Setback', 0, 10, 0.1, T.setback),
        { kind: 'chk', key: 'stops', label: '停止線 Stop lines' },
        num('stopGap', '停止線淨距 Stop gap', K.stopLine.toCrosswalk.min, Math.max(3, K.stopLine.toCrosswalk.max), 0.1, T.stopGap)];
    };
    const junctionCorner = [
      num('cornerR', '轉角半徑 Corner radius', 0, 30, 0.5, T.cornerR || '≈'),
      { kind: 'chk', key: 'sidewalks', label: '轉角人行道 Corner sidewalks' },
      num('swWidth', '人行道寬 Sidewalk width', 1.5, 10, 0.1, T.swWidth || '≈'),
      { kind: 'chk', key: 'bikeCross', label: T.bikeCrossLabel || '自行車穿越道 Bike crossings' }];

    return function fields(el) {
      if (K.own && K.own[el.type]) return K.own[el.type](el);
      switch (el.type) {
        case 'road': return [{ kind: 'sel', key: 'tone', label: '鋪面 Tone', options: [['asphalt', '新鋪瀝青 New asphalt'], ['worn', '舊瀝青 Worn'], ['concrete', '混凝土 Concrete']] },
          ...info('標線會被裁切在車道範圍內 (可於上方關閉)。Markings are clipped to road areas.')];
        case 'sidewalk': return [{ kind: 'sel', key: 'style', label: '樣式 Style', options: K.sidewalkStyles },
          ...info('人行道永遠蓋在標線上方 — 行人穿越道延伸進人行道時會被遮住。Sidewalks always render above markings.')];
        case 'surface': return [{ kind: 'sel', key: 'kind', label: '種類 Kind', options: K.surfaceKinds }, { kind: 'color', key: 'color', label: '顏色 Colour' }, { kind: 'chk', key: 'edge', label: '白色邊線 Edge line' }];
        case 'section': {
          const f = [
            { kind: 'head', label: '車道 Lanes' },
            { kind: 'laneEditor' },
            { kind: 'head', label: T.turnHead || '左轉 Left turn' },
            { kind: 'sel', key: 'leftTurn', label: T.turnLabel || '左轉方式', options: T.turnOpts || [['shared', '依車道箭頭 By lane arrows'], ['dedicated', '最內側車道專用 Inner lane only'], ['banned', '禁止左轉 No left turn']] },
            { kind: 'chk', key: 'leftGuide', label: T.leftGuide || '左轉導引線 Left-turn guide lines' },
            { kind: 'chk', key: 'rightGuide', label: T.rightGuide || '右轉導引線 Right-turn guide lines' },
          ];
          const anyPocket = ['pocketLF', 'pocketLB', 'pocketRF', 'pocketRB'].some((k) => +el[k] > 0) || el.leftTurn === 'pocket';
          if (anyPocket) f.push(num('pocketLen', '附加車道長度 Pocket length', 10, 120, 1, T.pocketLen), num('pocketTaper', '漸變段長度 Taper', 5, 80, 1, T.pocketTaper));
          f.push({ kind: 'head', label: '道路 Road' },
            num('laneWidth', '車道寬 Lane width', 2.5, 4.0, 0.05, T.laneWidth),
            { kind: 'num', key: 'lanesB', label: '對向車道數 (0 = 單行道)', min: 0, max: 6, step: 1 });
          if (el.lanesB > 0) f.push({ kind: 'sel', key: 'centerType', label: '中央 Centre', options: K.centerTypes });
          if (el.lanesB > 0 && el.centerType === 'median') f.push(num('medianWidth', '分隔島寬 Median', 0.5, 10, 0.1));
          if (T.bikeToggle) { // a switch, and the width once it is on
            f.push({ kind: 'chknum', key: 'bikeLane', label: T.bikeToggle.label, on: T.bikeToggle.on });
            if (+el.bikeLane > 0) f.push(num('bikeLane', T.bikeLane || '自行車道寬 Bike lane width', 0.75, 3, 0.05, T.bikeLaneLaw));
          } else f.push(num('bikeLane', T.bikeLane || '自行車道寬 Bike lane (0 = 無)', 0, 3, 0.1, T.bikeLaneLaw));
          if (T.slowLane !== false) f.push(num('slowLane', T.slowLane || '機慢車道寬 Slow lane (0 = 無)', 0, 4, 0.1));
          f.push({ kind: 'chk', key: 'pave', label: '鋪路面 Pave' }, { kind: 'chk', key: 'edge', label: T.edge || '路面邊線 Edge lines' }, { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' },
            { kind: 'head', label: '更多 More', fold: true },
            { kind: 'chk', key: 'autoArrows', label: T.autoArrows || '自動指向線 Lane arrows' });
          if (T.box !== false) {
            f.push({ kind: 'chk', key: 'autoBox', label: T.box || '機車停等區 Scooter box' });
            if (el.autoBox) f.push(num('boxDepth', T.boxDepth || '停等區深度 Box depth', (K.boxRange || [2.5, 6])[0], (K.boxRange || [2.5, 6])[1], 0.1, T.boxDepthLaw));
          }
          f.push(num('solidLen', T.solidLen || '路口前實線 Solid lines before stop line', 0, 60, 1, T.solidLenLaw),
            { kind: 'num', key: 'lanesF2', label: '後段車道數 → Lanes after change', min: 0, max: 6, step: 1, dflt: el.lanesF },
            ...(el.lanesB > 0 ? [{ kind: 'num', key: 'lanesB2', label: '後段對向車道數 ← after change', min: 0, max: 6, step: 1, dflt: el.lanesB }] : []),
            ...((el.lanesF2 != null && +el.lanesF2 !== +el.lanesF) || (el.lanesB > 0 && el.lanesB2 != null && +el.lanesB2 !== +el.lanesB) ? [num('changeAt', '變化起點 Change starts at (m)', 0, 2000, 1),
              Object.assign(num('taper', '漸變段長 Taper length', 5, 200, 1, T.taper), { dflt: 30 })] : []));
          return f;
        }
        case 'line': {
          const s = K.lineStyles[el.style];
          return [{ kind: 'sel', key: 'style', label: '標線 Style', options: Object.entries(K.lineStyles).map(([k, v]) => [k, v.name + ' ' + v.en]) },
            { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' }, ...law(s ? s.ref : '')];
        }
        case 'crosswalk': {
          const spec = K.crosswalk[el.kind] || K.crosswalk[Object.keys(K.crosswalk)[0]];
          const trap = !!el.quad, bars = el.kind === 'ties' || spec.style === 'bars';
          const f = [{ kind: 'sel', key: 'kind', label: '型式 Type', options: cwOpts }];
          if (el.id) f.push({ kind: 'sel', key: 'shape', label: '形狀 Shape', options: [['rect', '矩形 Rectangle'], ['trap', '梯形 Trapezoid (拖曳四角)']], value: trap ? 'trap' : 'rect' });
          if (!trap) f.push(num('width', '穿越道寬 Width', spec.width.min, spec.width.max, 0.1, `${spec.width.min}–${spec.width.max} m`));
          else f.push(...info(`拖曳四個角點調整形狀；線段寬度固定，沿中心線等距排列。兩端寬度請維持在 ${spec.width.min}–${spec.width.max} m。Drag the four corners.`));
          if (bars) f.push({ kind: 'lock', label: '線段寬 Bar width', value: spec.bar.toFixed(2) + ' m' }, num('gap', '間隔 Gap', spec.gap.min, spec.gap.max, 0.05, `${spec.gap.min.toFixed(2)}–${spec.gap.max.toFixed(2)} m`));
          else if (spec.style === 'lines') f.push({ kind: 'lock', label: '線 Lines', value: `${spec.edge.toFixed(2)} m, ${spec.dash[0]}–${spec.dash[1]}` });
          else f.push({ kind: 'lock', label: '平行線寬 Edge lines', value: spec.edge.toFixed(2) + ' m' }, { kind: 'lock', label: '斜紋 Stripes', value: `${spec.stripe.toFixed(2)} m / ${spec.gap.toFixed(2)} m @${spec.angle}°` });
          if (K.greenBase) f.push({ kind: 'chk', key: 'green', label: '綠色底 Green base' });
          f.push(...law(spec.ref),
            ...(trap ? [] : [{ kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'square', label: '垂直化 Square ends' }]),
            { kind: 'btn', action: 'addStop', label: `＋停止線 Stop line (${K.stopLine.toCrosswalk.min} m)` }, ...(trap ? [] : [{ kind: 'btn', action: 'flip', label: '反轉車流方向 Flip' }]));
          return f;
        }
        case 'stopline': return [num('width', '線寬 Width', K.stopLine.width.min, K.stopLine.width.max, 0.01, `${K.stopLine.width.min.toFixed(2)}–${K.stopLine.width.max.toFixed(2)} m`), ...law(K.stopLine.ref),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
        case 'arrow': return [{ kind: 'sel', key: 'kind', label: '種類 Kind', options: K.arrowKinds }, num('length', '長度 Length', K.arrowLenRange[0], K.arrowLenRange[1], 0.5, T.arrowLen),
          { kind: 'deg', key: 'dir', label: '方向 Angle' }, ...law(T.arrowLaw),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
        case 'text': return [{ kind: 'txt', key: 'text', label: '文字 Text' }, num('charLen', '字長 Char length', 0.3, 6, 0.05, T.charLen), num('charWid', '字寬 Char width', 0.2, 2, 0.05, T.charWid),
          num('charGap', '字距 Char gap', 0, 3, 0.05, T.charGap), ...info(T.textInfo),
          { kind: 'sel', key: 'color', label: '顏色 Colour', options: K.colorOpts }, { kind: 'sel', key: 'order', label: '字序 Order', options: [['far', '由遠而近 Far→near'], ['near', '由近而遠 Near→far']] },
          { kind: 'deg', key: 'dir', label: '方向 Angle' }, ...law(T.textLaw),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
        case 'junctionTool': return [...info(T.junctionInfo || '先用「路段」沿兩條道路中心線畫過路口，再用此工具點兩路交會處：會自動產生路口範圍 (中斷車道線)、各路口行人穿越道及停止線。十字、T字、斜交皆可。'),
          ...junctionCross(el), ...junctionCorner];
        case 'junction': return [...junctionCross(el), ...junctionCorner,
          ...((el.removed && el.removed.length) || (el.removedAt && el.removedAt.length) ? [{ kind: 'info', text: `已刪除 ${(el.removed || []).length + (el.removedAt || []).length} 個自動標線；「還原已刪除」可找回 (其他修改保留)。${(el.removed || []).length + (el.removedAt || []).length} deleted pieces can be brought back.` }, { kind: 'btn', action: 'restoreJunction', label: '還原已刪除 Restore deleted' }] : []),
          { kind: 'btn', action: 'regenJunction', label: '↻ 重新產生 Regenerate' }, ...info('路口範圍：範圍內的車道線、路段標線會被中斷 (行人穿越道、箭頭等不受影響)。拖曳節點可調整範圍；此框只在編輯時顯示，不會匯出。')];
        case 'roundaboutTool': case 'roundabout': {
          const tool = el.type === 'roundaboutTool', f = [];
          if (tool) f.push(...info(el.turbo ? '渦輪圓環：兩車道以螺旋分隔，進入前選車道、環內不變換車道。點中心放置。Turbo: lanes are chosen before entry.'
            : '點圓環中心。若已有路段穿過或接到圓環，會自動在各入口畫讓路標線、行人穿越道，並中斷圓環內的車道線與分隔島。Click the centre; road sections that reach the circle become legs.'));
          f.push(num('R', '外半徑 Outer radius', el.turbo ? 16 : 8, 70, 0.5, el.turbo ? '≈ 22–30 m' : T.rbR || '≈ 13–20 m'));
          if (el.turbo) {
            f.push(num('laneWidth', '環道車道寬 Lane width', 4, 6.5, 0.1, '≈ 5 m'),
              { kind: 'sel', key: 'divider', label: '車道分隔 Divider', options: [['raised', T.turboRaised || '凸起分隔帶 Raised kerb'], ['double', T.turboDouble || '雙白實線 Double white']] });
            if (!tool) f.push({ kind: 'deg', key: 'turboAxis', label: '螺旋方向 Spiral angle' }, { kind: 'num', key: 'turboTaper', label: '過渡角 Transition (°)', min: 8, max: 45, step: 1 });
          } else {
            f.push({ kind: 'num', key: 'lanes', label: '環道車道數 Lanes', min: 1, max: 3, step: 1 },
              num('laneWidth', '環道車道寬 Lane width', 4, 7, 0.1, '≈ 5–6 m'), num('apron', '可跨越緣帶 Truck apron', 0, 4, 0.1, '≈'));
          }
          f.push(num('cornerR', '進出口轉角半徑 Corner radius', 3, 30, 0.5, '≈'));
          f.push({ kind: 'chk', key: 'curveLanes', label: '車道彎入圓環 Curve lanes into ring' }, { kind: 'chk', key: 'splitters', label: '分隔島 Splitter islands' }, { kind: 'chk', key: 'laneStop', label: '車道線止於行人穿越道 Lane lines stop at crosswalk' },
            { kind: 'chk', key: 'stopLines', label: '停止線 Stop lines before crosswalks' }, num('stopGap', '停止線淨距 Stop gap', 1, 3, 0.1, T.stopGap),
            { kind: 'chk', key: 'solidApproach', label: '近圓環改實線 Solid lane lines on approach' }, num('solidLen', '實線長度 Solid length', 0, 60, 1, '≈'));
          if (!tool) f.push({ kind: 'sel', key: 'island', label: '中央島 Island', options: K.sidewalkStyles });
          if (T.bikeRing) {
            f.push({ kind: 'head', label: T.bikeRing.head }, { kind: 'chk', key: 'bikeRing', label: T.bikeRing.label });
            if (el.bikeRing) f.push(num('bikeW', T.bikeRing.width, 1.5, 4, 0.1, T.bikeRing.widthLaw), num('bikeGap', T.bikeRing.gap, 2, 10, 0.5, T.bikeRing.gapLaw),
              { kind: 'chk', key: 'bikePrio', label: T.bikeRing.prio }, ...law(T.bikeRing.law));
            f.push({ kind: 'head', label: '入口 Entries' });
          }
          f.push({ kind: 'chk', key: 'yields', label: T.yieldLabel || '入口讓路線 Yield lines' },
            { kind: 'chk', key: 'curvedYield', label: '沿圓環弧線 Follow the circle' },
            { kind: 'chk', key: 'crosswalks', label: '行人穿越道 Crosswalks' });
          if (tool) f.push({ kind: 'sel', key: 'cwKind', label: '型式 Type', options: cwOpts },
            num('cwWidth', '穿越道寬 Width', 2, 8, 0.1), num('cwSetback', '距讓路線 Setback', 2, 15, 0.5, '≈'));
          f.push(...law(T.rbLaw));
          if (!tool) f.push(...info('拖曳中心點移動、橘色點改半徑；入口標線會跟著移動。若沒有跟著動，按「重新產生入口」。'),
            { kind: 'btn', action: 'regen', label: '↻ 重新產生入口 Regenerate entries' });
          return f;
        }
        case 'yield': return [{ kind: 'num', key: 'lanes', label: '車道數 Lanes', min: 1, max: 6, step: 1 },
          { kind: 'chk', key: 'triangles', label: T.yieldTriangles || '三角形 Triangles' }].concat(el.arcC ? [{ kind: 'chk', key: 'curved', label: '沿圓環弧線 Follow roundabout curve' }] : []).concat([
          ...law(T.yieldLaw), { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉方向 Flip' }]);
        case 'busstop': return [
          { kind: 'sel', key: 'kind', label: '型式 Type', options: [['roadside', '路側 Kerbside (候車島)'], ['bay', '港灣式 Bus bay']] },
          ...info(el.kind === 'bay' ? '公車駛入港灣停靠，再駛回車道；候車區在人行道側。The bus pulls into the bay and rejoins traffic.' : '公車停在外側車道不需切入；候車島設在路緣，自行車道繞到候車島後方。The bus stops in its lane; bikes pass behind the island.'),
          { kind: 'chk', key: 'bike', label: '自行車道繞行後方 Bike lane behind the stop' },
          num('wP', el.kind === 'bay' ? '候車區寬 Platform width' : '候車島寬 Island width', 1.5, 5, 0.1, '≈ 2.0–3.0 m'),
          ...(el.bike !== false ? [num('wb', '自行車道寬 Bike lane width', 1.2, 2.5, 0.1, '≈'), num('Tb', '自行車道轉換段 Bike transition', 3, 30, 0.5, '≈')] : []),
          ...(el.kind === 'bay' ? [num('D', '港灣深度 Bay depth', 2.5, 4.5, 0.1, '≈ 3.0–3.5 m'), num('Lin', '進站漸變段 Entry taper', 5, 40, 0.5, '≈'), num('Lout', '出站漸變段 Exit taper', 5, 40, 0.5, '≈')] : []),
          { kind: 'txt', key: 'text', label: '標字 Wording' }, ...law(T.busStopLaw)];
        case 'bikelane': {
          const f = [{ kind: 'sel', key: 'kind', label: '種類 Type', options: T.bikeKinds || [['exclusive', '專用車道 Exclusive'], ['priority', '優先車道 Priority']] },
            num('width', '車道寬 Width', el.kind === 'priority' ? 1.0 : el.twoWay ? 2.0 : 1.0, 5, 0.1, el.twoWay ? T.bikeW2 : T.bikeW1),
            { kind: 'chk', key: 'twoWay', label: '雙向 Two-way' }];
          if (el.kind !== 'priority') f.push({ kind: 'chk', key: 'surface', label: T.bikeSurface || '彩色鋪面 Coloured surface' },
            { kind: 'sel', key: 'sep', label: '邊線 Edge lines', options: [['edges', '兩側白實線 White line each side'], ['left', '左側 (車道側) Left'], ['right', '右側 Right'], ['both', '兩側 Both'], ['none', '無 None']] },
            { kind: 'sel', key: 'sepStyle', label: '分隔線 Separator', options: T.bikeSepStyles || [['double', '雙白實線 Double white'], ['single', '白實線 Single white']] },
            { kind: 'chk', key: 'diamonds', label: '菱形標記 Diamonds' });
          f.push({ kind: 'chk', key: 'icons', label: '自行車圖示 Bike symbols' }, num('spacing', '標記間距 Spacing', 10, 120, 1, T.bikeSpacing),
            { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' }, ...law(el.kind === 'priority' ? T.bikePrioLaw : T.bikeLaw),
            ...info('沿車道中心線畫線即可；畫線方向的左側視為車流側。下方道路車道線會自動讓出，遇行人穿越道自動中斷。'),
            { kind: 'btn', action: 'flip', label: '反轉方向 Flip' });
          return f;
        }
        case 'buslane': return [num('width', '車道寬 Width', 3.0, 4.5, 0.05, '≈ 3.25–3.5 m'),
          { kind: 'sel', key: 'sep', label: '分隔線位置 Separator side', options: [['left', '左側 (車道側) Left'], ['right', '右側 Right'], ['both', '兩側 Both'], ['none', '無 None']] },
          { kind: 'sel', key: 'sepStyle', label: '分隔線 Separator', options: T.busSepStyles || [['double', '雙白實線 Double white'], ['single', '白實線 Single white']] },
          { kind: 'chk', key: 'diamonds', label: '菱形標記 Diamonds' },
          num('spacing', '標字間距 Spacing', 25, 120, 1, T.busSpacing), { kind: 'txt', key: 'text', label: '標字 Wording' },
          { kind: 'chk', key: 'surface', label: '彩色鋪面 Coloured surface' }, { kind: 'color', key: 'color', label: '鋪面顏色 Surface colour' },
          { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' }, ...law(T.busLaw),
          ...info('沿車道中心線畫線；畫線方向的左側為一般車道側。下方車道線自動讓出，遇行人穿越道自動中斷。'),
          { kind: 'btn', action: 'flip', label: '反轉方向 Flip' }];
        case 'symbol': return [{ kind: 'sel', key: 'kind', label: '圖示 Icon', options: T.symbolKinds || [['bike', '自行車 Bike']] },
          { kind: 'chk', key: 'small', label: '縮小型 Reduced (×0.7)' }, { kind: 'deg', key: 'dir', label: '方向 Angle' }, ...law(T.symbolLaw),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
        case 'chevron': return [{ kind: 'sel', key: 'color', label: '顏色 Colour', options: K.colorOpts },
          num('border', '外框 Border', 0.1, 0.4, 0.01, T.chevBorder), num('stripe', '斜紋寬 Stripe', 0.1, 0.6, 0.01, T.chevStripe), num('gap', '斜紋間距 Gap', 0.2, 3, 0.05, T.chevGap),
          { kind: 'deg', key: 'dir', label: '方向 Angle' }, ...law(T.chevLaw),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
        case 'yellowbox': return [num('border', '外框 Border', 0.1, 0.3, 0.01), num('stripe', '斜線寬 Stripe', 0.1, 0.3, 0.01), num('gap', '斜線間距 Spacing', 1, 5, 0.1, T.boxJunctionGap),
          { kind: 'deg', key: 'dir', label: '方向 Angle' }, ...law(T.boxJunctionLaw),
          { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
      }
      return [];
    };
  }
  return { makeFields, num };
})();
