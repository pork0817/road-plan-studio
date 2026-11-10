// 日本 Japan preset — 道路標識、区画線及び道路標示に関する命令 (標識令) 別表第4 (区画線)・別表第6 (道路標示),
// read from the figures as reprinted by NILIM (平成27年3月時点). Left-hand traffic.
// Values with a number (e.g. 203) were read from the regulation figures; values marked ≈ are typical, not specified.
window.RoadPresets = window.RoadPresets || {};
(function () {
  const C = {
    white: '#f4f4ef', yellow: '#f2a51a', red: '#d42a2a', blue: '#2a6fd6',
    asphalt: '#36383c', asphaltWorn: '#4b4c4f', concrete: '#9c9a94',
    ped: '#3d9a5c', bike: '#2f6fb8', scooter: '#2f62b8', bus: '#9c3b2f', crossGreen: '#3d9a5c', navi: '#2a6fd6',
  };
  const W = C.white, Y = C.yellow;
  const lineStyles = {
    lane:        { short: '車線境界線', name: '車線境界線 (破線)', en: 'Lane line', color: W, width: 0.15, pattern: 'dashed', dash: [5, 5], ref: '区画線 102 / 道路標示 206: 白破線 幅0.10–0.15 m、線長 l1 = 3–10 m、間隔 l2 = (1.0–2.0) l1 (一般道 5 m / 5 m ≈)' },
    laneSolid:   { short: '車線境界線 実線', name: '車線境界線 (実線)', en: 'Solid lane line', color: W, width: 0.15, pattern: 'solid', ref: '区画線 102: 白実線 幅0.10–0.15 m (交差点手前など)' },
    laneYellow:  { short: '進路変更禁止', name: '進路変更禁止 (黄実線)', en: 'No lane change', color: Y, width: 0.15, pattern: 'solid', ref: '道路標示 102の2: 黄色実線 幅0.10–0.15 m; 交差点手前おおむね30 m' },
    laneDouble:  { short: '進路変更禁止 両側', name: '進路変更禁止 (黄二重線)', en: 'No lane change, both ways', color: Y, width: 0.15, sep: 0.10, pattern: 'double', ref: '道路標示 102の2 (両側)' },
    centerDash:  { name: '中央線 (白破線)', en: 'Centre line, dashed', color: W, width: 0.15, pattern: 'dashed', dash: [5, 5], ref: '区画線 101 / 道路標示 205: 白破線 幅0.12–0.15 m、線長 3–10 m、間隔 = 線長' },
    centerSolid: { name: '中央線 (白実線)', en: 'Centre line, solid', color: W, width: 0.15, pattern: 'solid', ref: '道路標示 205: 白実線 幅0.15 m (片側幅員6 m以上など)' },
    centerYellow:{ name: 'はみ出し禁止 (黄実線)', en: 'No overtaking (yellow)', color: Y, width: 0.15, pattern: 'solid', ref: '道路標示 102: 黄色実線 幅0.15–0.20 m (中央線を兼ねる)' },
    centerDouble:{ name: '中央線 (二重線)', en: 'Double centre line', color: W, width: 0.15, sep: 0.15, pattern: 'double', ref: '道路標示 205: 実線2本 各0.10–0.15 m、間隔0.10–0.15 m (4車線以上)' },
    centerYellowDouble: { name: 'はみ出し禁止 (黄二重線)', en: 'No overtaking, double', color: Y, width: 0.15, sep: 0.15, pattern: 'double', ref: '道路標示 102' },
    edge:        { short: '車道外側線', name: '車道外側線', en: 'Edge line', color: W, width: 0.15, pattern: 'solid', ref: '区画線 103: 白実線 幅0.15–0.20 m' },
    roadside:    { short: '路側帯', name: '路側帯', en: 'Roadside strip', color: W, width: 0.15, pattern: 'solid', ref: '道路標示 108: 白実線 幅0.15–0.20 m; 路側帯の幅 1.5 m 以上 (やむを得ない場合 0.5 m)' },
    noStopStrip: { short: '駐停車禁止路側帯', name: '駐停車禁止路側帯', en: 'No-stopping strip', color: W, width: 0.15, sep: 0.15, pattern: 'solid-dashed', dash: [1, 1], ref: '道路標示 108の2: 実線 + 内側に白破線 0.10–0.15 m、破線・間隔 1–3 m' },
    pedStrip:    { short: '歩行者用路側帯', name: '歩行者用路側帯', en: 'Pedestrian strip', color: W, width: 0.15, sep: 0.15, pattern: 'double', ref: '道路標示 108の3: 白実線2本' },
    yellowCurb:  { short: '駐停車禁止', name: '駐停車禁止 (縁石 黄実線)', en: 'No stopping (kerb)', color: Y, width: 0.15, pattern: 'solid', curb: true, ref: '道路標示 103: 縁石の上に黄色実線' },
    yellowCurbDash: { short: '駐車禁止', name: '駐車禁止 (縁石 黄破線)', en: 'No parking (kerb)', color: Y, width: 0.15, pattern: 'dashed', dash: [1, 1], curb: true, ref: '道路標示 104: 縁石に黄色破線 (1–2 m ごと)' },
    priorityMain:{ short: '優先本線車道', name: '優先本線車道', en: 'Main line (merge)', color: W, width: 0.45, pattern: 'dashed', dash: [3, 1.5], ref: '道路標示 109の2: 白破線 幅0.30–0.75 m、線長 2–5 m、間隔 1.0–1.5 m' },
    bikeXLine:   { short: '自転車横断帯', name: '自転車横断帯 側線', en: 'Bike crossing line', color: W, width: 0.20, pattern: 'solid', ref: '道路標示 201の3: 白実線 幅0.15–0.30 m' },
    guide:       { short: '誘導線', name: '右左折の誘導線', en: 'Turn guide line', color: W, width: 0.15, pattern: 'dashed', dash: [1, 2], ref: '道路標示 111 / 111の2: 白破線 幅0.15–0.20 m、1–3 m ごと ≈' },
    slowSep:     { short: '車道外側線', name: '車道外側線', en: 'Edge line', color: W, width: 0.15, pattern: 'solid', hidden: true, ref: '' },
    bikeSep:     { short: '自転車専用通行帯', name: '自転車専用通行帯 境界', en: 'Bike lane line', color: W, width: 0.15, pattern: 'solid', hidden: true, ref: '道路標示 109の6 (車両通行帯の境界)' },
  };

  const crosswalk = {
    ties: { label: '横断歩道', name: '横断歩道 (ゼブラ)', style: 'bars', bar: 0.45, gap: { min: 0.45, max: 0.50 }, width: { min: 2, max: 8 },
      ref: '道路標示 201: 白の縞 l1 = l2 = 0.45–0.50 m (線と間隔が同じ)、横断歩道の幅は 4 m を標準 (最低 2 m ≈)、平成4年以降 側線なし' },
  };
  const stopLine = { width: { min: 0.30, max: 0.45 }, dflt: 0.45, toCrosswalk: { min: 1, max: 3 },
    ref: '道路標示 203: 白実線 幅0.30–0.45 m (中央線から外側線まで)、横断歩道の手前 1 m 以上 (標準 2 m ≈)' };

  const sidewalkStyles = [['pavers', '歩道 (平板) Pavers'], ['redbrick', 'レンガ Brick'], ['concrete', 'コンクリート Concrete'], ['island', '分離帯・植栽 Island'], ['tactile', '点字ブロック付き Tactile strip']];
  const surfaceKinds = [['bike', '自転車レーン 青 Blue bike'], ['ped', 'グリーンベルト 緑 Green'], ['bus', 'バスレーン 赤 Bus'], ['custom', '任意 Custom']];
  const centerTypes = [['centerDash', '中央線 白破線'], ['centerSolid', '中央線 白実線'], ['centerYellow', 'はみ出し禁止 黄実線'], ['centerDouble', '中央線 二重線'], ['centerYellowDouble', 'はみ出し禁止 黄二重線'], ['median', '中央分離帯 Median']];
  const arrowKinds = [['S', '直進 Straight'], ['L', '左折 Left'], ['R', '右折 Right'], ['SL', '直進・左折'], ['SR', '直進・右折'], ['LR', '左折・右折'], ['SLR', '全方向'], ['U', '転回 (≈)']];
  const colorOpts = [['white', '白 White'], ['yellow', '黄 Yellow']];

  const typeNames = {
    road: '車道 Road area', sidewalk: '歩道・分離帯 Sidewalk', surface: 'カラー舗装 Surface', section: '路線 Road section',
    line: '区画線 Line', crosswalk: '横断歩道 Crosswalk', stopline: '停止線 Stop line', scooterbox: '二段停止線 Two-stage stop line',
    junction: '交差点 Intersection', roundabout: '環状交差点 Roundabout', bikelane: '自転車専用通行帯 Bike lane', buslane: 'バス専用通行帯 Bus lane', roundaboutTool: '環状交差点',
    yield: 'ゆずれ (破線+▽) Give way', arrow: '進行方向 Arrow', symbol: '記号 Symbol', text: '文字 Text', chevron: '導流帯 Hatched area', yellowbox: '停止禁止部分', busstop: 'バス停 Bus stop',
  };

  const sec = (label, en, o) => ({ id: 'sec_' + label, label, en, mode: 'polyline', icon: { glyph: '═' },
    defaults: Object.assign({ type: 'section', lanesF: 1, lanesB: 1, laneWidth: 3.25, centerType: 'centerSolid', medianWidth: 2, slowLane: 0, bikeLane: 0, edge: true, pave: false, smooth: true, autoArrows: true, autoBox: false, boxDepth: 3, solidLen: 30, laneUse: '', leftGuide: false, leftTurn: 'shared', pocketLen: 30, pocketTaper: 20 }, o) });
  const arrow = (k, g) => ({ id: 'arrow_' + k, label: arrowKinds.find((a) => a[0] === k)[1].split(' ')[0], en: '204 進行方向 5 m', mode: 'point', icon: { glyph: g }, defaults: { type: 'arrow', kind: k, length: 5, dir: -Math.PI / 2 } });
  const text = (t, o) => ({ id: 'text_' + t, label: t, en: (o && o.en) || '文字', mode: 'point', icon: { glyph: t.slice(0, 2) }, defaults: Object.assign({ type: 'text', text: t, charLen: 2.4, charWid: 0.8, charGap: 0.8, color: 'white', order: 'far', dir: -Math.PI / 2 }, o, { en: undefined }) });
  const chev = (id, label, en, o) => ({ id, label, en, mode: 'poly', icon: { glyph: '⫽' }, defaults: Object.assign({ type: 'chevron', color: 'white', border: 0.15, stripe: 0.45, gap: 1.0, dir: 0 }, o) });
  const sym = (k, label, en, g) => ({ id: 'icon_' + k, label, en, mode: 'point', icon: { glyph: g }, defaults: { type: 'symbol', kind: k, small: false, dir: -Math.PI / 2 } });

  const library = [
    { title: 'エリア 區域 Areas', items: [
      { id: 'road', label: '車道', en: 'Road area', mode: 'poly', icon: { fill: C.asphalt }, defaults: { type: 'road', tone: 'asphalt' } },
      { id: 'sidewalk', label: '歩道', en: 'Sidewalk', mode: 'poly', icon: { fill: '#a7a49d' }, defaults: { type: 'sidewalk', style: 'pavers' } },
      { id: 'island', label: '分離帯', en: 'Island / planter', mode: 'poly', icon: { fill: '#6c9a52' }, defaults: { type: 'sidewalk', style: 'island' } },
      { id: 'surf_green', label: 'グリーンベルト', en: 'Green strip (school route)', mode: 'poly', icon: { fill: C.ped }, defaults: { type: 'surface', kind: 'ped', color: C.ped, edge: false } },
      { id: 'surf_bike', label: '自転車レーン 青', en: 'Blue bike surface', mode: 'poly', icon: { fill: C.bike }, defaults: { type: 'surface', kind: 'bike', color: C.bike, edge: false } },
      { id: 'surf_bus', label: 'バスレーン 舗装', en: 'Bus surface', mode: 'poly', icon: { fill: C.bus }, defaults: { type: 'surface', kind: 'bus', color: C.bus, edge: false } },
    ] },
    { title: '路線 路段 Roads', items: [
      sec('2車線', 'Two-lane, dashed centre', { lanesF: 1, lanesB: 1, laneWidth: 3.0, centerType: 'centerDash' }),
      sec('2車線 はみ出し禁止', 'Two-lane, no overtaking', { lanesF: 1, lanesB: 1, laneWidth: 3.25, centerType: 'centerYellow' }),
      sec('4車線', 'Four-lane', { lanesF: 2, lanesB: 2, laneWidth: 3.25, centerType: 'centerDouble' }),
      sec('4車線 中央分離帯', 'Four-lane with median', { lanesF: 2, lanesB: 2, laneWidth: 3.25, centerType: 'median', medianWidth: 2 }),
      sec('一方通行', 'One-way', { lanesF: 2, lanesB: 0, laneWidth: 3.0 }),
      sec('自転車専用通行帯付き', 'With bike lanes', { lanesF: 1, lanesB: 1, laneWidth: 3.0, centerType: 'centerSolid', bikeLane: 1.5 }),
      { id: 'junction', label: '交差点', en: 'Intersection: click crossing', mode: 'junction', icon: { glyph: '✚' },
        defaults: { type: 'junctionTool', cwKind: 'ties', cwWidth: 4, setback: 2, stopGap: 2, crosswalks: true, stops: true, cornerR: 8, sidewalks: true, swWidth: 3, bikeCross: true } },
      { id: 'junction_pri', label: '優先道路の交差点', en: 'Side road joins a priority road: click crossing', mode: 'junction', icon: { glyph: '┣' },
        defaults: { type: 'junctionTool', control: 'priority', minorCtrl: 'stop', cwMain: false, cwKind: 'ties', cwWidth: 4, setback: 2, stopGap: 2, crosswalks: true, stops: true, cornerR: 6, sidewalks: true, swWidth: 3, bikeCross: true } },
      { id: 'roundabout', label: '環状交差点', en: 'Roundabout (clockwise): click centre', mode: 'roundabout', icon: { glyph: '◎' },
        defaults: { type: 'roundaboutTool', R: 14, lanes: 1, laneWidth: 5.0, apron: 2, island: 'island', yields: true, curvedYield: true, crosswalks: true, cwKind: 'ties', cwWidth: 4, cwSetback: 5, cornerR: 10, curveLanes: true, splitters: true, laneStop: true, solidApproach: false, solidLen: 30, stopLines: false, stopGap: 2 } },
    ] },
    { title: '区画線 標線 Lines', items: Object.entries(lineStyles).filter(([, s]) => !s.hidden).map(([k, s]) => ({ id: 'line_' + k, label: s.short || s.name, en: s.name + ' ' + s.en, mode: 'polyline', icon: { line: k }, defaults: { type: 'line', style: k, smooth: true } })) },
    { title: '交差点 路口 Junction', items: [
      { id: 'cw_ties', label: '横断歩道', en: 'Crosswalk (201)', mode: 'two', icon: { glyph: '▥' }, defaults: { type: 'crosswalk', kind: 'ties', width: 4, gap: 0.45, green: false } },
      { id: 'stopline', label: '停止線', en: 'Stop line (203)', mode: 'two', icon: { glyph: '▬' }, defaults: { type: 'stopline', width: 0.45 } },
      { id: 'scooterbox', label: '二段停止線', en: 'Two-stage stop line (203の2)', mode: 'two', icon: { glyph: '▭' }, defaults: { type: 'scooterbox', depth: 3, side: '0.15', icon: false, text: '' } },
      { id: 'yield', label: 'ゆずれ 破線＋▽', en: 'Give way (≈)', mode: 'two', icon: { glyph: '▽' }, defaults: { type: 'yield', lanes: 1, triangles: true } },
      chev('dohryu', '導流帯', 'Zebra zone (208の2)', { color: 'white', border: 0.15, stripe: 0.45, gap: 1.0 }),
      chev('tachiiri', '立入り禁止部分', 'No entry zone (106)', { color: 'yellow', border: 0.20, stripe: 0.45, gap: 1.0 }),
      chev('teishi', '停止禁止部分', 'Keep clear (107)', { color: 'white', border: 0.15, stripe: 0.10, gap: 1.5 }),
    ] },
    { title: '自転車・バス 自行車・公車', items: [
      { id: 'bike_lane', label: '自転車専用通行帯', en: 'Bike lane (blue)', mode: 'polyline', icon: { fill: C.bike }, defaults: { type: 'bikelane', kind: 'exclusive', width: 1.5, twoWay: false, surface: true, sep: 'left', sepStyle: 'single', spacing: 30, icons: true, diamonds: false, smooth: true } },
      { id: 'bus_lane', label: 'バス専用通行帯', en: 'Bus-only lane (109の6)', mode: 'polyline', icon: { fill: C.bus }, defaults: { type: 'buslane', kind: 'exclusive', width: 3.25, surface: false, sep: 'left', sepStyle: 'single', diamonds: false, spacing: 50, text: 'バス専用', smooth: true } },
      { id: 'bus_prio', label: 'バス優先通行帯', en: 'Bus-priority lane (109の7)', mode: 'polyline', icon: { fill: C.bus }, defaults: { type: 'buslane', kind: 'exclusive', width: 3.25, surface: false, sep: 'left', sepStyle: 'single', diamonds: false, spacing: 50, text: 'バス優先', smooth: true } },
      { id: 'bus_stop', label: 'バス停', en: 'Bus stop at the kerb (click start, end)', mode: 'two', icon: { glyph: '▤' }, defaults: { type: 'busstop', kind: 'roadside', bike: true, wP: 2.5, wb: 1.5, D: 3.0, Lin: 15, Lout: 12, Tb: 10, text: 'バス' } },
      { id: 'bus_bay', label: 'バスベイ', en: 'Bus bay (click start, end)', mode: 'two', icon: { glyph: '◫' }, defaults: { type: 'busstop', kind: 'bay', bike: true, wP: 2.5, wb: 1.5, D: 3.0, Lin: 15, Lout: 12, Tb: 10, text: 'バス' } },
    ] },
    { title: '進行方向 指向線 Arrows', items: [arrow('S', '↑'), arrow('L', '↰'), arrow('R', '↱'), arrow('SL', '⬉'), arrow('SR', '⬈'), arrow('LR', '⇄'), arrow('SLR', '⇈')] },
    { title: '文字 Text', items: [text('止まれ', { en: '一時停止 (≈ 2.4 m)' }), text('徐行'), text('バス専用', { en: '109の6' }), text('バス優先', { en: '109の7' }), text('自転車専用'),
      text('40', { color: 'yellow', charLen: 5.0, charWid: 1.2, charGap: 0.3, en: '105 最高速度 縦5.0 横1.2' }), text('30', { color: 'yellow', charLen: 5.0, charWid: 1.2, charGap: 0.3, en: '105 最高速度' })] },
    { title: '記号 圖示 Symbols', items: [sym('bike', '自転車', 'Bike symbol 0.7 × 1.0', '自'), sym('navi', '矢羽根 (ナビライン)', 'Blue chevron 0.75 × 1.5', '➤'),
      sym('xdiamond', '◇ 横断歩道あり', '210: 1.5 × 5.0 m', '◇'), sym('prioTri', '▽ 前方優先道路', '211: 1.5 × 4.5 m', '▽')] },
  ];

  const T = {
    cwWidth: '201: 4 m 標準', setback: '≈ 交差道路の車道端から', stopGap: '203: 横断歩道の手前 1 m 以上 (標準 2 m ≈)',
    cornerR: '≈', swWidth: '≈ 歩道 2 m 以上', bikeCrossLabel: '自転車横断帯 Bike crossing (201の3)',
    turnHead: '右折 Right turn', turnLabel: '右折の方法', turnOpts: [['shared', '矢印どおり By lane arrows'], ['dedicated', '右端車線を右折専用 Right lane only'], ['banned', '右折禁止 No right turn']],
    leftGuide: '左折の誘導線 Left-turn guide lines', rightGuide: '右折の誘導線 Right-turn guide lines (111)',
    ctrlSignal: '信号交差点 / 全方向停止線', ctrlPriority: '優先道路: 従道路が止まる・ゆずる', minorOpts: [['stop', '停止線＋「止まれ」 Stop (203)'], ['yield', 'ゆずれ 破線＋▽ Give way (211, ≈)']],
    priorityInfo: '車線数の多い道路が優先道路: 中央線・車線境界線は交差点内も連続 (道路交通法36条)。従道路に停止線と「止まれ」。The centre line of the priority road runs through.',
        pocketLen: '≈ 右折車線長 = 減速長 + 滞留長', pocketTaper: '≈', laneWidth: '≈ 道路構造令: 3.0–3.5 m',
    bikeLane: '自転車専用通行帯 Bike lane (0 = なし)', bikeLaneLaw: '≈ ガイドライン: 1.5 m 以上 (やむを得ない場合 1.0 m)', slowLane: false, edge: '車道外側線 Edge lines',
    autoArrows: '進行方向の矢印 Lane arrows', box: '二段停止線 Two-stage stop line', boxDepth: '二輪・四輪の間隔 Spacing', boxDepthLaw: '203の2: 2–5 m、各線 0.10–0.45 m、文字「二輪」「四輪」',
    solidLen: '交差点手前の実線 Solid before stop line', solidLenLaw: '≈ 102の2 進路変更禁止はおおむね 30 m', taper: '≈',
    arrowLen: '204: 全長 5 m (設計速度 60 km/h 以上は拡大可)',
    arrowLaw: '標識令 別表第6 「進行方向」(204)・110: 全長 5 m、軸 0.15 m; 直進は矢じり 2.5 × 0.45 m、右左折は矢じり 2.2 m を曲がる側へ傾け R 1.0/0.5 m で接続。交差点手前 30–50 m の区間に設置。',
    charLen: '≈ 文字は別表第2 の字形の縦を3倍 (備考三)', charWid: '≈', charGap: '≈',
    textInfo: '日本語は車線に沿って縦書き、数字は車線を横切って一行。Japanese is stacked along the lane; numbers run across it.',
    textLaw: '別表第6 備考三: 文字の形は別表第2の図の縦を3倍; 最高速度 (105) 黄色 縦5.0 m 横1.2 m',
    yieldLabel: '流入部の標示 Entry markings', yieldTriangles: '▽ 前方優先道路 (211)',
    yieldLaw: '日本の「ゆずれ」は標識で規制し、路面は 211 ▽ (底辺1.0–2.0 m、長さ3倍、線0.20–0.30 m) で予告 — 破線は ≈',
    rbR: '≈ 環状交差点 外径 27 m 程度', rbLaw: '環状交差点 (右回り) 111の2: 白破線 幅0.15–0.20 m、1–3 m ごと。その他の寸法 ≈',
    busStopLaw: '≈ バス停車帯: 路側に黄色の駐停車禁止 (103)、白枠と「バス」',
    bikeKinds: [['exclusive', '自転車専用通行帯 Bike lane']], bikeW1: '≈ 1.5 m 以上', bikeW2: '≈', bikeSurface: '青色カラー舗装 Blue surface',
    bikeSepStyles: [['single', '白実線 Solid'], ['double', '白二重線 Double']], bikeSpacing: '≈',
    bikeLaw: '道路標示 109の6 (普通自転車専用通行帯) + 自転車の記号; 青色カラーは ≈ (安全で快適な自転車利用環境創出ガイドライン)',
    busSepStyles: [['single', '白実線 Solid'], ['double', '白二重線 Double']], busSpacing: '≈',
    busLaw: '道路標示 109の6 専用通行帯 / 109の7 路線バス等優先通行帯: 白の文字、規制時間を文字の手前に (例 7-9)、通常は第1通行帯',
    symbolKinds: [['bike', '自転車 Bike'], ['navi', '矢羽根 Navi chevron'], ['xdiamond', '◇ 横断歩道あり'], ['prioTri', '▽ 前方優先道路']],
    symbolLaw: '210 ◇: 縦5.0 m 横1.5 m、線0.20–0.30 m、横断歩道の手前 30 m と 10–20 m 手前に; 211 ▽: 底辺 1.0–2.0 m、長さ底辺の3倍; 自転車記号 0.7 × 1.0 m',
    chevBorder: '208の2: 0.15–0.20 m (106 黄 0.15–0.30)', chevStripe: '208の2: 0.45 m (107: 0.10 m)', chevGap: '1.0–1.5 m',
    chevLaw: '導流帯 208の2 白 / 立入り禁止部分 106 黄 / 停止禁止部分 107 白: 枠線と斜線',
    boxJunctionGap: '107: 1.0–1.5 m', boxJunctionLaw: '停止禁止部分 107',
  };

  window.RoadPresets.JP = {
    id: 'JP', name: '日本 Japan', driveSide: 'left',
    law: '道路標識、区画線及び道路標示に関する命令 (別表第4・第6)',
    colors: C, lineStyles, crosswalk, stopLine, typeNames, library,
    fields: window.RoadPresetKit.makeFields({ lineStyles, crosswalk, stopLine, centerTypes, arrowKinds, colorOpts, sidewalkStyles, surfaceKinds, T, minorCtrl: 'stop', boxRange: [2, 5], arrowLenRange: [3, 10] }),
    fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif',
    arrowSet: 'JP', arrowLen: 5, tracedGlyphs: false,
    roadText: { len: 2.4, wid: 0.8, gap: 0.8, rowLen: 5.0, rowWid: 1.2, rowGap: 0.3 },
    busLaneText: 'バス専用', busStop: { kerb: 'yellow', box: true, text: 'バス' },
    yield: { style: 'jp' },
    box: { front: 0, back: 0.30, sides: false, labels: ['二輪', '四輪'] }, boxRange: [2, 5],
    bikeCross: { line: 'bikeXLine', lineW: 0.20, gap: 0.10, minW: 1.5, pad: 0.4, symbols: true },
    iconSizes: { bike: [0.7, 1.0], navi: [0.75, 1.5] },
    twoStageBox: false, busSepStyle: 'single', busDiamonds: false, stopText: '止まれ', minorCtrl: 'stop',
  };
})();
