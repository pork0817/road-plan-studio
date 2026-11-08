// 台灣 Taiwan preset — 道路交通標誌標線號誌設置規則 (全國法規資料庫, 115.03.11 修正版)
// Values with a § article reference were checked against the regulation text.
// Values marked ≈ are not specified by the regulation (e.g. arrow length, text size) — typical defaults.
window.RoadPresets = window.RoadPresets || {};
(function () {
  const C = {
    white: '#f4f4ef', yellow: '#f3c316', red: '#d42a2a',
    asphalt: '#36383c', asphaltWorn: '#4b4c4f', concrete: '#9c9a94',
    ped: '#3d9a5c', bike: '#b5523b', scooter: '#2f62b8', bus: '#8f2f2f', crossGreen: '#3d9a5c',
  };

  // All values below verified against the regulation text (全國法規資料庫, 115.03.11 版) unless marked ≈.
  const lineStyles = {
    lane:         { name: '車道線', en: 'Lane line', color: C.white, width: 0.10, pattern: 'dashed', dash: [4, 6], ref: '§182 白虛線 線段4m 間距6m 線寬10cm' },
    laneSolid:    { name: '禁止變換車道線(單邊)', en: 'No lane change', color: C.white, width: 0.10, pattern: 'solid', ref: '§167 白實線 線寬10cm' },
    laneDouble:   { name: '禁止變換車道線(雙邊)', en: 'Double white', color: C.white, width: 0.10, sep: 0.10, pattern: 'double', ref: '§167 雙白實線 線寬10cm 間隔10cm' },
    laneMixed:    { name: '白實虛線', en: 'White solid+dash', color: C.white, width: 0.10, sep: 0.10, pattern: 'solid-dashed', dash: [4, 6], ref: '§167 單邊禁止變換車道 白實線+白虛線 間隔10cm' },
    reversible:   { name: '調撥車道線', en: 'Reversible lane', color: C.white, width: 0.10, sep: 0.10, pattern: 'double-dashed', dash: [4, 6], ref: '§158 雙白虛線 線段4m 間距6m 線寬10cm 間隔10cm' },
    centerDash:   { name: '行車分向線', en: 'Centre line', color: C.yellow, width: 0.10, pattern: 'dashed', dash: [4, 6], ref: '§181 黃虛線 線段4m 間距6m 線寬10cm' },
    centerSolid:  { name: '單黃實線', en: 'Single yellow', color: C.yellow, width: 0.10, pattern: 'solid', ref: '§165 分向限制線 線寬10cm' },
    centerDouble: { name: '雙黃實線', en: 'Double yellow', color: C.yellow, width: 0.10, sep: 0.10, pattern: 'double', ref: '§165 分向限制線 線寬及間隔均為10cm' },
    centerMixed:  { name: '黃實虛線', en: 'Yellow solid+dash', color: C.yellow, width: 0.10, sep: 0.10, pattern: 'solid-dashed', dash: [4, 6], ref: '§166 單向禁止超車 黃實線+黃虛線 間隔10cm' },
    edge:         { name: '路面邊線', en: 'Edge line', color: C.white, width: 0.15, pattern: 'solid', ref: '§183 白實線 線寬15cm' },
    slowSep:      { name: '快慢車道分隔線', en: 'Fast/slow divider', color: C.white, width: 0.10, pattern: 'solid', ref: '§183-1 白實線 線寬10cm' },
    bikeSep:      { name: '自行車專用車道線', en: 'Bike lane divider', color: C.white, width: 0.10, sep: 0.10, pattern: 'double', ref: '§174 以雙白實線分隔 (線寬/間隔同§167: 10cm)' },
    noParking:    { name: '禁止停車線', en: 'No parking (curb)', color: C.yellow, width: 0.10, pattern: 'solid', curb: true, ref: '§168 黃實線 線寬10cm；無緣石時距路面邊緣30cm' },
    noStopping:   { name: '禁止臨時停車線', en: 'No stopping (curb)', color: C.red, width: 0.10, pattern: 'solid', curb: true, ref: '§169 紅實線 線寬10cm；無緣石時距路面邊緣30cm' },
  };

  const crosswalk = {
    ties:  { name: '枕木紋行人穿越道線', bar: 0.40, gap: { min: 0.40, max: 0.80 }, width: { min: 2, max: 8 }, ref: '§185 線段平行車流 長2–8m 寬40cm 間隔40–80cm (同組一致)；距橫交路口路面邊緣3–5m；得塗綠底' },
    zebra: { name: '斑馬紋行人穿越道線', edge: 0.10, stripe: 0.40, gap: 0.40, angle: 45, width: { min: 3, max: 8 }, ref: '§186 兩平行實線間距3–8m 線寬10cm；斜紋45° 寬與間隔40cm；距最近行人穿越設施≥200m' },
  };
  const stopLine = { width: { min: 0.30, max: 0.40 }, toCrosswalk: { min: 2, max: 3 }, ref: '§170 白實線 寬30–40cm；與行人穿越道淨距2–3m (受限時不小於1m)' };

  const sidewalkStyles = [
    ['pavers', '灰色連鎖磚 Grey pavers'], ['redbrick', '紅磚 Red brick'], ['concrete', '混凝土 Concrete'],
    ['island', '分隔島/綠帶 Planted island'], ['tactile', '導盲磚帶 With tactile strip'],
  ];
  const surfaceKinds = [['ped', '人行道標線 (綠, §174-3)'], ['bike', '自行車專用道 磚紅 (§174)'], ['scooter', '機車專用道 藍 (§174)'], ['bus', '公車專用道鋪面'], ['custom', '自訂 Custom']];
  const centerTypes = [
    ['centerDouble', '雙黃實線 Double yellow'], ['centerSolid', '單黃實線 Single yellow'], ['centerDash', '行車分向線 Yellow dashed'],
    ['centerMixed', '黃實虛線 Solid+dashed'], ['reversible', '調撥車道線 Reversible'], ['median', '中央分隔島 Median'],
  ];
  const arrowKinds = [['S', '直行 Straight (圖一)'], ['L', '左轉 Left (圖二)'], ['R', '右轉 Right (圖二鏡射)'], ['SL', '直行+左轉 (圖三)'], ['SR', '直行+右轉 (圖三鏡射)'], ['LR', '左右轉 (圖四)'], ['SLR', '直行+左右轉 (圖五)'], ['U', '迴轉 U-turn (≈ 無附圖)']];
  const colorOpts = [['white', '白 White'], ['yellow', '黃 Yellow'], ['red', '紅 Red']];

  const typeNames = {
    road: '車道範圍 Road area', sidewalk: '人行道/分隔島 Sidewalk', surface: '彩色鋪面 Surface', section: '路段 Road section',
    line: '標線 Line', crosswalk: '行人穿越道 Crosswalk', stopline: '停止線 Stop line', scooterbox: '機車停等區 Scooter box',
    junction: '路口範圍 Intersection', roundabout: '圓環 Roundabout', bikelane: '自行車道 Bike lane', roundaboutTool: '圓環 Roundabout', yield: '讓路線 Yield line', arrow: '指向線 Arrow', symbol: '圖示 Icon', text: '路面文字 Text', chevron: '槽化線 Channelizing', yellowbox: '網狀線 Box junction',
  };

  const sec = (label, en, o) => ({ id: 'sec_' + label, label, en, mode: 'polyline', icon: { glyph: '═' },
    defaults: Object.assign({ type: 'section', lanesF: 1, lanesB: 1, laneWidth: 3.25, centerType: 'centerDouble', medianWidth: 2, slowLane: 0, bikeLane: 0, edge: true, pave: false, smooth: true }, o) });
  const arrow = (k, g) => ({ id: 'arrow_' + k, label: arrowKinds.find((a) => a[0] === k)[1].split(' ')[0], en: '指向線', mode: 'point', icon: { glyph: g }, defaults: { type: 'arrow', kind: k, length: 5, dir: -Math.PI / 2 } });
  const text = (t, o) => ({ id: 'text_' + t, label: t, en: (o && o.en) || '路面文字', mode: 'point', icon: { glyph: t.slice(0, 2) }, defaults: Object.assign({ type: 'text', text: t, charLen: 2.5, charWid: 1.0, charGap: 1.0, color: 'white', order: 'far', dir: -Math.PI / 2 }, o, { en: undefined }) });
  const icon = (k, label, en, o) => ({ id: 'icon_' + k + (o && o.small ? '_s' : ''), label, en, mode: 'point', icon: { glyph: k === 'bike' ? '🚲' : '🛵' }, defaults: Object.assign({ type: 'symbol', kind: k, small: false, dir: -Math.PI / 2 }, o) });

  const library = [
    { title: '① 區域 Areas', items: [
      { id: 'road', label: '車道範圍', en: 'Road area', mode: 'poly', icon: { fill: C.asphalt }, defaults: { type: 'road', tone: 'asphalt' } },
      { id: 'sidewalk', label: '人行道', en: 'Sidewalk', mode: 'poly', icon: { fill: '#a7a49d' }, defaults: { type: 'sidewalk', style: 'pavers' } },
      { id: 'island', label: '分隔島', en: 'Island / planter', mode: 'poly', icon: { fill: '#6c9a52' }, defaults: { type: 'sidewalk', style: 'island' } },
      { id: 'surf_ped', label: '標線型人行道', en: 'Painted sidewalk', mode: 'poly', icon: { fill: C.ped }, defaults: { type: 'surface', kind: 'ped', color: C.ped, edge: true } },
      { id: 'surf_bike', label: '自行車道鋪面', en: 'Bike surface', mode: 'poly', icon: { fill: C.bike }, defaults: { type: 'surface', kind: 'bike', color: C.bike, edge: false } },
      { id: 'surf_scooter', label: '機車專用道鋪面', en: 'Scooter lane (blue)', mode: 'poly', icon: { fill: C.scooter }, defaults: { type: 'surface', kind: 'scooter', color: C.scooter, edge: false } },
      { id: 'surf_bus', label: '公車道鋪面', en: 'Bus surface', mode: 'poly', icon: { fill: C.bus }, defaults: { type: 'surface', kind: 'bus', color: C.bus, edge: false } },
    ] },
    { title: '② 路段 Road sections', items: [
      sec('雙向2車道', 'Local 1+1', { lanesF: 1, lanesB: 1, laneWidth: 3.0, centerType: 'centerDash' }),
      sec('市區4車道', 'Urban 2+2', { lanesF: 2, lanesB: 2, laneWidth: 3.25, centerType: 'centerDouble', slowLane: 0 }),
      sec('幹道6車道', 'Arterial 3+3 median', { lanesF: 3, lanesB: 3, laneWidth: 3.25, centerType: 'median', medianWidth: 2, slowLane: 0 }),
      sec('單行道', 'One-way 2 lanes', { lanesF: 2, lanesB: 0, laneWidth: 3.0, slowLane: 0 }),
      sec('自行車道路段', 'With bike lanes', { lanesF: 1, lanesB: 1, laneWidth: 3.25, centerType: 'centerDouble', bikeLane: 1.5 }),
      { id: 'junction', label: '路口 (自動)', en: 'Intersection: click crossing', mode: 'junction', icon: { glyph: '✚' },
        defaults: { type: 'junctionTool', cwKind: 'ties', cwWidth: 4, setback: 3, stopGap: 2, crosswalks: true, stops: true } },
      { id: 'roundabout', label: '圓環 (自動)', en: 'Roundabout: click centre', mode: 'roundabout', icon: { glyph: '◎' },
        defaults: { type: 'roundaboutTool', R: 18, lanes: 1, laneWidth: 5.5, apron: 2, island: 'island', yields: true, curvedYield: true, crosswalks: true, cwKind: 'ties', cwWidth: 4, cwSetback: 6.5, cornerR: 12, curveLanes: true, splitters: true, laneStop: true, solidApproach: false, solidLen: 30, stopLines: true, stopGap: 2 } },
      { id: 'turbo', label: '渦輪圓環', en: 'Turbo roundabout', mode: 'roundabout', icon: { glyph: '🌀' },
        defaults: { type: 'roundaboutTool', turbo: true, R: 24, lanes: 2, laneWidth: 5, apron: 0, divider: 'raised', island: 'island', yields: true, curvedYield: true, crosswalks: true, cwKind: 'ties', cwWidth: 4, cwSetback: 6.5, cornerR: 12, curveLanes: true, splitters: true, laneStop: true, solidApproach: false, solidLen: 30, stopLines: true, stopGap: 2 } },
    ] },
    { title: '③ 標線 Lines', items: Object.entries(lineStyles).map(([k, s]) => ({ id: 'line_' + k, label: s.name, en: s.en, mode: 'polyline', icon: { line: k }, defaults: { type: 'line', style: k, smooth: true } })) },
    { title: '④ 路口 Intersection', items: [
      { id: 'cw_ties', label: '枕木紋行人穿越道', en: 'Crosswalk (ties)', mode: 'two', icon: { glyph: '▥' }, defaults: { type: 'crosswalk', kind: 'ties', width: 4, gap: 0.40, green: false } },
      { id: 'cw_zebra', label: '斑馬紋行人穿越道', en: 'Crosswalk (zebra)', mode: 'two', icon: { glyph: '▧' }, defaults: { type: 'crosswalk', kind: 'zebra', width: 4, green: false } },
      { id: 'yield', label: '讓路線', en: 'Yield line (§172)', mode: 'two', icon: { glyph: '▽' }, defaults: { type: 'yield', lanes: 1, triangles: true } },
      { id: 'stopline', label: '停止線', en: 'Stop line', mode: 'two', icon: { glyph: '▬' }, defaults: { type: 'stopline', width: 0.40 } },
      { id: 'scooterbox', label: '機慢車停等區', en: 'Scooter waiting box', mode: 'two', icon: { glyph: '▭' }, defaults: { type: 'scooterbox', depth: 3, side: '0.15', icon: true, text: '' } },
      { id: 'chevron', label: '槽化線', en: 'Channelizing', mode: 'poly', icon: { glyph: '⫽' }, defaults: { type: 'chevron', color: 'white', border: 0.15, stripe: 0.20, gap: 0.30, dir: 0 } },
      { id: 'yellowbox', label: '網狀線', en: 'Box junction', mode: 'poly', icon: { glyph: '▦' }, defaults: { type: 'yellowbox', border: 0.20, stripe: 0.10, gap: 1.50, dir: 0 } },
    ] },
    { title: '🚲 自行車道 Cycling', items: [
      { id: 'bike_excl', label: '自行車專用車道', en: 'Bike lane (§174)', mode: 'polyline', icon: { fill: C.bike }, defaults: { type: 'bikelane', kind: 'exclusive', width: 1.5, twoWay: false, surface: true, sep: 'left', spacing: 40, icons: true, diamonds: true, smooth: true } },
      { id: 'bike_two', label: '雙向自行車道', en: 'Two-way bike lane', mode: 'polyline', icon: { fill: C.bike }, defaults: { type: 'bikelane', kind: 'exclusive', width: 2.5, twoWay: true, surface: true, sep: 'both', spacing: 40, icons: true, diamonds: true, smooth: true } },
      { id: 'bike_prio', label: '自行車優先車道', en: 'Bike priority lane (§174-4)', mode: 'polyline', icon: { glyph: '🚲' }, defaults: { type: 'bikelane', kind: 'priority', width: 1.5, twoWay: false, surface: false, sep: 'none', spacing: 40, icons: true, diamonds: false, smooth: true } },
    ] },
    { title: '⑤ 指向線 Arrows (§188)', items: [arrow('S', '↑'), arrow('L', '↰'), arrow('R', '↱'), arrow('SL', '⬉'), arrow('SR', '⬈'), arrow('LR', '⇄'), arrow('SLR', '⇈'), arrow('U', '↶')] },
    { title: '⑥ 路面文字 Text', items: [text('慢', { en: '§163' }), text('停', { en: '§177' }), text('禁行機車', { color: 'yellow', en: '§178 黃色' }),
      text('公車專用', { en: '§175' }), text('機車專用', { en: '§175' }), text('大客車專用', { en: '§175' }), text('大貨車專用', { en: '§175' }),
      text('自行車專用', { en: '§175' }), text('高乘載專用', { en: '§175' }), text('直行專用', { en: '§176' }), text('左彎專用', { en: '§176' }), text('右彎專用', { en: '§176' }),
      text('機車優先', { en: '§174-1' }),
      text('禁止停車', { charLen: 0.3, charWid: 0.3, charGap: 0.3, color: 'yellow', en: '§168 30cm' }), text('禁止臨時停車', { charLen: 0.3, charWid: 0.3, charGap: 0.3, color: 'red', en: '§169 30cm' })] },
    { title: '⑦ 圖示 Icons', items: [icon('scooter', '機車圖示', '§174-1 0.9×2.5m'), icon('scooterSmall', '機車圖示(慢車道)', '§183-1 0.65×1.8m'),
      icon('bike', '自行車圖示', '§183-1 1.0×1.8m'), icon('scooterSmall', '機車圖示 縮小型', '§183-1 ×0.7', { small: true }), icon('bike', '自行車 縮小型', '§183-1 ×0.7', { small: true })] },
  ];

  const num = (key, label, min, max, step, law) => ({ kind: 'num', key, label, min, max, step, unit: 'm', law });

  function fields(el) {
    switch (el.type) {
      case 'road': return [{ kind: 'sel', key: 'tone', label: '鋪面 Tone', options: [['asphalt', '新鋪瀝青 New asphalt'], ['worn', '舊瀝青 Worn'], ['concrete', '混凝土 Concrete']] },
        { kind: 'info', text: '標線會被裁切在車道範圍內 (可於上方關閉)。Markings are clipped to road areas.' }];
      case 'sidewalk': return [{ kind: 'sel', key: 'style', label: '樣式 Style', options: sidewalkStyles },
        { kind: 'info', text: '人行道永遠蓋在標線上方 — 行人穿越道延伸進人行道時會被遮住。Sidewalks always render above markings.' }];
      case 'surface': return [{ kind: 'sel', key: 'kind', label: '種類 Kind', options: surfaceKinds }, { kind: 'color', key: 'color', label: '顏色 Colour' }, { kind: 'chk', key: 'edge', label: '白色邊線 15cm edge' }];
      case 'section': {
        const f = [
          { kind: 'num', key: 'lanesF', label: '順向車道數 Lanes →', min: 0, max: 6, step: 1 },
          { kind: 'num', key: 'lanesB', label: '對向車道數 Lanes ← (0=單行)', min: 0, max: 6, step: 1 },
          num('laneWidth', '車道寬 Lane width', 2.5, 4.0, 0.05, '≈ 市區常用 3.0–3.5m'),
        ];
        if (el.lanesB > 0) f.push({ kind: 'sel', key: 'centerType', label: '中央 Centre', options: centerTypes });
        if (el.lanesB > 0 && el.centerType === 'median') f.push(num('medianWidth', '分隔島寬 Median', 0.5, 10, 0.1));
        f.push(num('slowLane', '機慢車道寬 Slow lane (0=無)', 0, 4, 0.1), num('bikeLane', '自行車道寬 Bike lane (0=無)', 0, 3, 0.1),
          { kind: 'chk', key: 'edge', label: '路面邊線 Edge lines' }, { kind: 'chk', key: 'pave', label: '自動鋪路面 Pave band' }, { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' },
          { kind: 'info', text: '台灣靠右行駛：畫線方向的右側為順向車道。Right-hand traffic: lanes on the right of your drawing direction flow forward.' });
        return f;
      }
      case 'line': {
        const s = lineStyles[el.style];
        return [{ kind: 'sel', key: 'style', label: '標線 Style', options: Object.entries(lineStyles).map(([k, v]) => [k, v.name + ' ' + v.en]) },
          { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' }, { kind: 'law', text: s ? s.ref : '' }];
      }
      case 'crosswalk': {
        const spec = crosswalk[el.kind];
        const trap = !!el.quad;
        const f = [{ kind: 'sel', key: 'kind', label: '型式 Type', options: [['ties', '枕木紋 Ties'], ['zebra', '斑馬紋 Zebra']] }];
        if (el.id) f.push({ kind: 'sel', key: 'shape', label: '形狀 Shape', options: [['rect', '矩形 Rectangle'], ['trap', '梯形 Trapezoid (拖曳四角)']], value: trap ? 'trap' : 'rect' });
        if (!trap) f.push(num('width', '穿越道寬 Width', spec.width.min, spec.width.max, 0.1, '法規 ' + spec.width.min + '–' + spec.width.max + ' m'));
        else f.push({ kind: 'info', text: '拖曳四個角點調整形狀；枕木紋線段維持 40 cm 寬，沿中心線等距排列。兩端寬度請維持在法規 ' + spec.width.min + '–' + spec.width.max + ' m。Drag the four corners.' });
        if (el.kind === 'ties') f.push({ kind: 'lock', label: '線段寬 Bar width', value: '0.40 m' }, num('gap', '間隔 Gap', spec.gap.min, spec.gap.max, 0.05, '法規 0.40–0.80 m'));
        else f.push({ kind: 'lock', label: '平行線寬 Edge lines', value: '0.10 m' }, { kind: 'lock', label: '斜紋 Stripes', value: '0.40 m / 0.40 m @45°' });
        f.push({ kind: 'chk', key: 'green', label: '綠色底 Green base' }, { kind: 'law', text: spec.ref },
          ...(trap ? [] : [{ kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'square', label: '垂直化 Square ends' }]),
          { kind: 'btn', action: 'addStop', label: '＋停止線 (上游 2m)' }, ...(trap ? [] : [{ kind: 'btn', action: 'flip', label: '反轉車流方向 Flip' }]));
        return f;
      }
      case 'stopline': return [num('width', '線寬 Width', stopLine.width.min, stopLine.width.max, 0.01, '法規 0.30–0.40 m'), { kind: 'law', text: stopLine.ref },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
      case 'scooterbox': return [num('depth', '縱深 Depth', 2.5, 6, 0.1, '法規 2.5–6 m'),
        { kind: 'lock', label: '前後線寬 Front/back', value: '0.20 m' },
        { kind: 'sel', key: 'side', label: '側線寬 Side lines', options: [['0.1', '0.10 m'], ['0.15', '0.15 m']] },
        { kind: 'chk', key: 'icon', label: '機車圖示 Scooter icon' }, { kind: 'txt', key: 'text', label: '或文字 Text (視需要)' },
        { kind: 'law', text: '§174-2 白色長方形 前後線寬20cm 側線10或15cm 縱深2.5–6m；限速≤60km/h 設於停止線後；禁行機車或紅燈右轉車道不設' },
        { kind: 'btn', action: 'flip', label: '反轉方向 Flip' }, { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
      case 'arrow': return [{ kind: 'sel', key: 'kind', label: '種類 Kind', options: arrowKinds }, { kind: 'lock', label: '長度 Length', value: '5.0 m (§188 附圖)' },
        { kind: 'deg', key: 'dir', label: '方向 Angle' },
        { kind: 'law', text: '§188 附圖尺寸：全長5.0m；直線箭頭頭寬0.9m 長2.6m 桿寬0.2m；弧形箭頭 R=2.0/1.2m 寬1.2m；分岔箭頭寬1.65/2.2m。共用車道≥3.5m 時兩箭頭間距0.5–1.5m；§176 每30m 重複一組' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
      case 'text': return [{ kind: 'txt', key: 'text', label: '文字 Text' }, num('charLen', '字長 Char length', 0.3, 5, 0.05, '附圖 2.5 m (禁止停車字樣0.3 m)'), num('charWid', '字寬 Char width', 0.3, 2, 0.05, '附圖 1.0 m'),
        num('charGap', '字距 Char gap', 0, 3, 0.05, '附圖 1.0 m'),
        { kind: 'info', text: '慢 停 禁行機車 公車/機車/大客車/大貨車/自行車/高乘載專用 直行/左彎/右彎專用 使用法規附圖字形；其他字以粗體字型代替。' },
        { kind: 'sel', key: 'color', label: '顏色 Colour', options: colorOpts }, { kind: 'sel', key: 'order', label: '字序 Order', options: [['far', '由遠而近 Far→near (§150)'], ['near', '由近而遠 Near→far']] },
        { kind: 'deg', key: 'dir', label: '方向 Angle' },
        { kind: 'law', text: '§150 直式文字一律由遠而近；正楷或變體字；禁止(臨時)停車字樣30cm見方、字距30cm (§168/169)' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
      case 'junctionTool': return [
        { kind: 'info', text: '先用「路段」沿兩條道路中心線畫過路口，再用此工具點兩路交會處：會自動產生路口範圍 (中斷車道線)、各路口行人穿越道及停止線。十字、T字、斜交皆可。' },
        { kind: 'chk', key: 'crosswalks', label: '行人穿越道 Crosswalks' },
        { kind: 'sel', key: 'cwKind', label: '型式 Type', options: [['ties', '枕木紋 Ties'], ['zebra', '斑馬紋 Zebra']] },
        num('cwWidth', '穿越道寬 Width', 2, 8, 0.1, '法規 2–8 m'),
        num('setback', '退縮 Setback', 0, 10, 0.1, '§185 距橫交路口路面邊緣 3–5 m'),
        { kind: 'chk', key: 'stops', label: '停止線 Stop lines' },
        num('stopGap', '停止線淨距 Stop gap', 1, 3, 0.1, '§170 與行人穿越道淨距 2–3 m (≥1 m)')];
      case 'roundaboutTool': case 'roundabout': {
        const tool = el.type === 'roundaboutTool', f = [];
        if (tool) f.push({ kind: 'info', text: el.turbo
          ? '渦輪圓環：兩車道以螺旋分隔，進入前選車道、環內不變換車道。點中心放置；接到圓環的路段會自動產生入口讓路線與行人穿越道。Turbo: lanes are chosen before entry.'
          : '點圓環中心。若已有路段穿過或接到圓環，會自動在各入口畫讓路線、行人穿越道，並中斷圓環內的車道線與分隔島。Click the centre; road sections that reach the circle become legs.' });
        f.push(num('R', '外半徑 Outer radius', el.turbo ? 16 : 8, 70, 0.5, el.turbo ? '≈ 渦輪圓環常用 22–30 m' : '≈ 單車道圓環常用 13–20 m'));
        if (el.turbo) {
          f.push(num('laneWidth', '環道車道寬 Lane width', 4, 6.5, 0.1, '≈ 常用 5 m'),
            { kind: 'sel', key: 'divider', label: '車道分隔 Divider', options: [['raised', '凸起分隔帶 Raised kerb'], ['double', '雙白實線 Double white (§167)']] });
          if (!tool) f.push({ kind: 'deg', key: 'turboAxis', label: '螺旋方向 Spiral angle' }, { kind: 'num', key: 'turboTaper', label: '過渡角 Transition (°)', min: 8, max: 45, step: 1 });
        } else {
          f.push({ kind: 'num', key: 'lanes', label: '環道車道數 Lanes', min: 1, max: 3, step: 1 },
            num('laneWidth', '環道車道寬 Lane width', 4, 7, 0.1, '≈ 環道常用 5–6 m'), num('apron', '可跨越緣帶 Truck apron', 0, 4, 0.1, '≈'));
        }
        f.push(num('cornerR', '進出口轉角半徑 Corner radius', 3, 30, 0.5, '≈ 道路邊線以此半徑彎入圓環'));
        f.push({ kind: 'chk', key: 'curveLanes', label: '車道彎入圓環 Curve lanes into ring' }, { kind: 'chk', key: 'splitters', label: '分隔島 Splitter islands' }, { kind: 'chk', key: 'laneStop', label: '車道線止於行人穿越道 Lane lines stop at crosswalk' },
          { kind: 'chk', key: 'stopLines', label: '停止線 Stop lines before crosswalks' }, num('stopGap', '停止線淨距 Stop gap', 1, 3, 0.1, '§170 與行人穿越道淨距 2–3 m (≥1 m)'),
          { kind: 'chk', key: 'solidApproach', label: '近圓環改實線 Solid lane lines on approach' }, num('solidLen', '實線長度 Solid length', 0, 60, 1, '≈ 禁止變換車道線'));
        if (!tool) f.push({ kind: 'sel', key: 'island', label: '中央島 Island', options: sidewalkStyles });
        f.push({ kind: 'chk', key: 'yields', label: '入口讓路線 Yield lines (§172)' },
          { kind: 'chk', key: 'curvedYield', label: '讓路線沿圓環弧線 Curved yield lines' },
          { kind: 'chk', key: 'crosswalks', label: '行人穿越道 Crosswalks' });
        if (tool) f.push({ kind: 'sel', key: 'cwKind', label: '型式 Type', options: [['ties', '枕木紋 Ties'], ['zebra', '斑馬紋 Zebra']] },
          num('cwWidth', '穿越道寬 Width', 2, 8, 0.1, '法規 2–8 m'), num('cwSetback', '距讓路線 Setback', 2, 15, 0.5, '≈ 讓路線標記約5.8m 深，建議≥6.5 m'));
        f.push({ kind: 'law', text: '設置規則對圓環無專門附圖；環道尺寸為設計常用值 (≈)。讓路線依 §172。' });
        if (!tool) f.push({ kind: 'info', text: '拖曳中心點移動、橘色點改半徑；入口讓路線與行人穿越道會跟著移動。若標線沒有跟著動，按「重新產生入口」。' },
          { kind: 'btn', action: 'regen', label: '↻ 重新產生入口 Regenerate entries' });
        return f;
      }
      case 'yield': return [{ kind: 'num', key: 'lanes', label: '車道數 Lanes (三角形數)', min: 1, max: 6, step: 1 },
        { kind: 'chk', key: 'triangles', label: '倒三角形 Triangles' }].concat(el.arcC ? [{ kind: 'chk', key: 'curved', label: '沿圓環弧線 Follow roundabout curve' }] : []).concat([
        { kind: 'law', text: '§172 讓路線：白色雙虛線＋倒三角形 (寬1.2m 長3.0m 線寬15cm 頂部60cm)，三角形距虛線2.0–2.5m。虛線尺寸量自附圖 (≈)。' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉方向 Flip' }]);
      case 'junction': return [{ kind: 'info', text: '路口範圍：範圍內的車道線、路段標線會被中斷 (行人穿越道、箭頭等不受影響)。拖曳節點可調整範圍；此框只在編輯時顯示，不會匯出。' }];
      case 'bikelane': {
        const minW = el.kind === 'priority' ? 1.2 : el.twoWay ? 2.5 : 1.2;
        const f = [{ kind: 'sel', key: 'kind', label: '種類 Type', options: [['exclusive', '專用車道 Exclusive (§174)'], ['priority', '優先車道 Priority (§174-4)']] },
          num('width', '車道寬 Width', minW, 5, 0.1, el.twoWay ? '≈ 手冊：雙向 ≥ 2.5 m' : '≈ 手冊：單向 ≥ 1.2 m，建議 1.5–2.0 m'),
          { kind: 'chk', key: 'twoWay', label: '雙向 Two-way' }];
        if (el.kind !== 'priority') f.push({ kind: 'chk', key: 'surface', label: '磚紅色鋪面 Brick-red surface (§174)' },
          { kind: 'sel', key: 'sep', label: '雙白實線 Separator', options: [['left', '左側 (車道側) Left'], ['right', '右側 Right'], ['both', '兩側 Both'], ['none', '無 None']] },
          { kind: 'chk', key: 'diamonds', label: '菱形標記 Diamonds' });
        f.push({ kind: 'chk', key: 'icons', label: '自行車圖示 Bike icons' }, num('spacing', '標記間距 Spacing', 30, 60, 1, '§174 菱形每 30–60 m'),
          { kind: 'chk', key: 'smooth', label: '平滑曲線 Smooth curve' },
          { kind: 'law', text: el.kind === 'priority' ? '§174-4 自行車優先車道：兩條白實線，間隔至少 1.2 m，路口處繪自行車圖示' : '§174 自行車專用車道：菱形 長軸250cm 短軸100cm 線寬15cm，每30–60m；以雙白實線分隔；鋪面磚紅色' },
          { kind: 'info', text: '沿車道中心線畫線即可；畫線方向的左側視為車流側 (雙白實線)。下方道路車道線會自動讓出，遇行人穿越道自動中斷。' },
          { kind: 'btn', action: 'flip', label: '反轉方向 Flip' });
        return f;
      }
      case 'symbol': return [{ kind: 'sel', key: 'kind', label: '圖示 Icon', options: [['scooter', '機車 0.9×2.5m (§174-1)'], ['scooterSmall', '機車 0.65×1.8m (§183-1)'], ['bike', '自行車 1.0×1.8m (§183-1)']] },
        { kind: 'chk', key: 'small', label: '縮小型 Reduced (×0.7, §183-1)' }, { kind: 'deg', key: 'dir', label: '方向 Angle' },
        { kind: 'law', text: '§183-1 慢車道於路口進口處繪設機車及自行車圖示，超過500m 每500m 增設；慢車道寬<2m 用縮小型' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }, { kind: 'btn', action: 'flip', label: '反轉 Flip' }];
      case 'chevron': return [{ kind: 'sel', key: 'color', label: '顏色 Colour (同銜接標線)', options: colorOpts },
        { kind: 'lock', label: '外框 Border', value: '0.15 m' }, { kind: 'lock', label: '斜紋 Stripes', value: '0.20 m / 0.30 m @45°' },
        { kind: 'deg', key: 'dir', label: '方向 Angle' }, { kind: 'law', text: '§171 槽化線 外框15cm 斜紋寬20cm 間隔30cm 45°；顏色同銜接之標線' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
      case 'yellowbox': return [{ kind: 'lock', label: '外框 Border', value: '0.20 m' }, { kind: 'lock', label: '網線寬 Stripe', value: '0.10 m @45°' },
        num('gap', '網線間距 Spacing', 1, 5, 0.1, '法規 1–5 m'), { kind: 'deg', key: 'dir', label: '方向 Angle' },
        { kind: 'law', text: '§173 網狀線 黃色 外框20cm 內部斜線10cm 與行車方向45° 間距1–5m' },
        { kind: 'btn', action: 'realign', label: '對齊車道 Align to lanes' }];
    }
    return [];
  }

  window.RoadPresets.TW = {
    id: 'TW', name: '台灣 Taiwan', driveSide: 'right',
    law: '道路交通標誌標線號誌設置規則 (115.03.11 修正)',
    colors: C, lineStyles, crosswalk, stopLine, typeNames, library, fields,
    fontFamily: '"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif',
  };
})();
