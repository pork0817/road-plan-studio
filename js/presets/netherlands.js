// Nederland / Netherlands preset — RVV 1990 & BABW (Uitvoeringsvoorschriften), CROW "Richtlijnen voor de bebakening
// en markering van wegen" (RBBV 1991, Rijkswaterstaat; updates from CROW 2015/2024 where public).
// Values with a reference were read from those texts; values marked ≈ are typical, not specified.
window.RoadPresets = window.RoadPresets || {};
(function () {
  const C = {
    white: '#f4f4ef', yellow: '#f3c316', red: '#d42a2a', blue: '#2f62b8',
    asphalt: '#36383c', asphaltWorn: '#4b4c4f', concrete: '#9c9a94',
    ped: '#8c8a84', bike: '#a8473a', scooter: '#2f62b8', bus: '#7a3a35', crossGreen: '#3d9a5c',
  };
  const W = C.white;
  // RBBV 2.1 / 3.1: lines at least 0.10 m; non-motorways 0.10 m (edge line cat. III 0.15 m), motorways 0.15 / 0.20 m.
  // Patterns: bubeko 3-9 (3 m line, 9 m gap), bibeko 1-3; warning lines 9-3 / 3-1; 1-1 at exits, bike lanes, parking.
  const lineStyles = {
    lane:       { short: 'Deelstreep 1-3', name: 'Deelstreep 1-3 (bibeko)', en: 'Lane line, urban', color: W, width: 0.10, pattern: 'dashed', dash: [1, 3], ref: 'RBBV 3.1: binnen de bebouwde kom 1-3 (streep 1,00 m, tussenruimte 3,00 m), breedte 0,10 m' },
    lane39:     { short: 'Deelstreep 3-9', name: 'Deelstreep 3-9 (bubeko)', en: 'Lane line, rural', color: W, width: 0.10, pattern: 'dashed', dash: [3, 9], ref: 'RBBV 3.1: buiten de bebouwde kom 3-9 (streep 3,00 m, tussenruimte 9,00 m); autosnelweg 0,15 m breed' },
    laneSolid:  { short: 'Doorgetrokken', name: 'Doorgetrokken streep', en: 'Solid line', color: W, width: 0.10, pattern: 'solid', ref: 'RVV art. 76: niet overschrijden. RBBV 2.1: ≥ 0,10 m; lengte ≥ 20 m (bij kruispunten ≤ 10 m als deelstreep); geen strepen tussen 10 en 20 m' },
    laneDouble: { short: 'Dubbel doorgetrokken', name: 'Dubbele doorgetrokken streep', en: 'Double solid (3 × 0.10)', color: W, width: 0.10, sep: 0.10, pattern: 'double', ref: 'RBBV 3.13/3.17: 3 × 0,10 m (streep–tussenruimte–streep), bv. tussen opstelstroken en bij linksafvakken' },
    warn31:     { short: 'Waarschuwing 3-1', name: 'Waarschuwingsstreep 3-1 (bibeko)', en: 'Warning line, urban', color: W, width: 0.10, pattern: 'dashed', dash: [3, 1], ref: 'RBBV 2.1/3.2: waarschuwingsstreep binnen de bebouwde kom 3-1, vóór een doorgetrokken streep (≥ 40 m bibeko)' },
    warn93:     { short: 'Waarschuwing 9-3', name: 'Waarschuwingsstreep 9-3 (bubeko)', en: 'Warning line, rural', color: W, width: 0.10, pattern: 'dashed', dash: [9, 3], ref: 'RBBV 3.2: buiten de bebouwde kom 9-3, ≥ 75–100 m vóór een doorgetrokken streep' },
    laneMixed:  { short: 'Doorgetr. + waarsch.', name: 'Doorgetrokken + waarschuwingsstreep', en: 'Solid + warning line', color: W, width: 0.10, sep: 0.10, pattern: 'solid-dashed', dash: [3, 1], ref: 'RVV art. 76 lid 2: rechts van een doorgetrokken streep een onderbroken streep → mag wel overschreden worden (vanaf die kant). RBBV: 3 × 0,10 m' },
    centerDash:  { name: 'Asstreep 1-3', en: 'Centre line, urban', color: W, width: 0.10, pattern: 'dashed', dash: [1, 3], ref: 'RBBV 3.1: asstreep bibeko 1-3, 0,10 m (kleur van markering is wit, RBBV 1.5)' },
    center39:    { name: 'Asstreep 3-9', en: 'Centre line, rural', color: W, width: 0.10, pattern: 'dashed', dash: [3, 9], ref: 'RBBV 3.1: asstreep bubeko 3-9, 0,10 m (bij verhardingsbreedte ≥ 5,10 m)' },
    centerSolid: { name: 'Doorgetrokken asstreep', en: 'Solid centre line', color: W, width: 0.10, pattern: 'solid', ref: 'RVV art. 76; RBBV 3.2: in bogen ≥ 50 m (horizontaal) / 75 m (verticaal), ingeleid door waarschuwingsstrepen' },
    centerDouble:{ name: 'Dubbele asstreep', en: 'Double centre line', color: W, width: 0.10, sep: 0.10, pattern: 'double', ref: 'Rijrichtingscheiding: ten minste twee doorgetrokken strepen (UV BABW); Europese regels: tussenruimte ≤ 0,18 m' },
    centerMixed: { name: 'Doorgetrokken + 3-1', en: 'Solid + warning centre', color: W, width: 0.10, sep: 0.10, pattern: 'solid-dashed', dash: [3, 1], ref: 'RVV art. 76 lid 2' },
    none:        { name: 'Geen asstreep', en: 'No centre line', color: 'rgba(0,0,0,0)', width: 0, pattern: 'none', hidden: true, ref: 'RBBV 3.1: erven en 30 km/h-gebieden: geen lengtemarkering' },
    edge:       { short: 'Kantstreep', name: 'Kantstreep', en: 'Edge line', color: W, width: 0.10, pattern: 'solid', ref: 'RBBV 3.1: doorgetrokken kantstreep 0,10 m (cat. III 0,15 m, autosnelweg 0,20 m), niet op de rand van de verharding (kantstrook ≥ 0,10 m)' },
    edgeDash:   { short: 'Kantstreep 3-3', name: 'Onderbroken kantstreep 3-3', en: 'Dashed edge line (GOW)', color: W, width: 0.15, pattern: 'dashed', dash: [3, 3], ref: 'CROW (gebiedsontsluitingswegen) tabel 14-1: kantstreep 0,15 m, patroon 3-3' },
    block:      { short: 'Blokmarkering 0,30', name: 'Blokmarkering 1-3 (0,30 m)', en: 'Block marking', color: W, width: 0.30, pattern: 'dashed', dash: [1, 3], ref: 'UV BABW: blokmarkering altijd 1-3 (1,00 m blok, 3,00 m ruimte), ≥ 20 m lang; 0,30 m (GOW, kantstreep 0,15) of 0,45 m (stroomweg, kantstreep 0,20)' },
    block45:    { short: 'Blokmarkering 0,45', name: 'Blokmarkering 1-3 (0,45 m)', en: 'Block marking, motorway', color: W, width: 0.45, pattern: 'dashed', dash: [1, 3], ref: 'UV BABW: 0,45 m bij stroomwegen (kantstreep 0,20 m); RBBV 3.12: bij uitrijstrook < 3,00 m mag 0,30 m' },
    fiets11:    { short: 'Streep 1-1', name: 'Onderbroken streep 1-1 (fietsstrook)', en: 'Bike lane line 1-1', color: W, width: 0.10, pattern: 'dashed', dash: [1, 1], ref: 'RBBV 3.7: fiets- en suggestiestrook: streep 1,00 m, tussenruimte 1,00 m, 0,10 m (bij bestrating 0,10–0,15 m)' },
    fietsAs:    { short: 'As fietspad', name: 'Asstreep fietspad 0,30-2,70', en: 'Two-way cycle path centre', color: W, width: 0.10, pattern: 'dashed', dash: [0.3, 2.7], ref: 'RBBV 3.6: tweerichtingsfietspad: streep 0,30 m, ruimte 2,70 m, 0,10 m; waarschuwing 2,70-0,30' },
    blocks50:   { short: 'Blokken 0,50', name: 'Blokmarkering fietsoversteek', en: 'Cycle crossing blocks', color: W, width: 0.50, pattern: 'dashed', dash: [0.5, 0.5], ref: 'RBBV 2.2c / UV BABW: blokken 0,50 × 0,50 m, ruimte gelijk aan het blok; oversteek ≥ 1,50 m breed incl. blokken; 0,50 m (min. 0,30) van de zebra' },
    slowSep:    { short: 'Doorgetrokken', name: 'Doorgetrokken streep', en: 'Solid line', color: W, width: 0.10, pattern: 'solid', hidden: true, ref: '' },
    bikeSep:    { short: 'Fietsstrook 1-1', name: 'Fietsstrookscheiding 1-1', en: 'Bike lane line', color: W, width: 0.10, pattern: 'dashed', dash: [1, 1], hidden: true, ref: 'RBBV 3.7' },
    guide:      { short: 'Geleidelijn 1-1', name: 'Geleidelijn 1-1 (kruispuntvlak)', en: 'Junction guide line', color: W, width: 0.10, pattern: 'dashed', dash: [1, 1], ref: 'RBBV 3.8: over kruispunten en aansluitingen 1-1 (0,10 m) ≈' },
    yellowSolid:{ short: 'Gele doorgetrokken', name: 'Gele doorgetrokken streep', en: 'No stopping (kerb)', color: C.yellow, width: 0.10, pattern: 'solid', curb: true, ref: 'RVV art. 23 / UV BABW: verbod stil te staan; ≥ 0,10 m; alleen binnen de bebouwde kom, meestal op de trottoirband' },
    yellowDash: { short: 'Gele onderbroken', name: 'Gele onderbroken streep', en: 'No parking (kerb)', color: C.yellow, width: 0.10, pattern: 'dashed', dash: [1, 1], curb: true, ref: 'RVV art. 24 / UV BABW: verbod te parkeren; streep:onderbreking 1:1, 0,5:0,5 of 0,3:0,3 m; ≥ 3 strepen; ≥ 0,10 m' },
    blueLine:   { short: 'Blauwe streep', name: 'Blauwe streep', en: 'Blue zone (kerb)', color: C.blue, width: 0.10, pattern: 'solid', curb: true, ref: 'RVV art. 25 (bord E10): blauwe zone; ≥ 0,10 m' },
  };

  const crosswalk = {
    ties:  { label: 'Zebrapad', name: 'Voetgangersoversteekplaats (zebra)', style: 'bars', bar: 0.50, gap: { min: 0.40, max: 0.60 }, width: { min: 4, max: 8 },
      ref: 'RVV art. 49 / UV BABW / RBBV 2.2c: witte strepen evenwijdig aan de rijbaan, 0,50 m breed, tussenruimte 0,50 m (CROW: 0,40–0,60); oversteekplaats ≥ 4,00 m breed; alleen binnen de bebouwde kom' },
    lines: { label: 'Kanalisatiestrepen', name: 'Kanalisatiestrepen (VRI)', style: 'lines', edge: 0.10, dash: [0.5, 0.5], width: { min: 3, max: 6 },
      ref: 'RBBV 2.2c: bij verkeerslichten voorkeur boven zebra; strepen 0,10 m breed, 0,50 m lang, ruimte 0,50 m; afstand tussen de strepen 3,00–6,00 m' },
  };
  const stopLine = { width: { min: 0.20, max: 0.50 }, dflt: 0.30, toCrosswalk: { min: 1, max: 3 },
    ref: 'RVV art. 79 / RBBV 2.2b: stopstreep 0,30 m binnen de bebouwde kom (≤ 50 km/h), 0,50 m buiten (≥ 70 km/h); bij verkeerslichten ook dubbel 3 × 0,15 / 3 × 0,30 m. CROW 2024: minimaal 0,20 m. Afstand tot de oversteek ≈' };

  const sidewalkStyles = [['pavers', 'Klinkers / tegels Pavers'], ['redbrick', 'Rode klinkers Red brick'], ['concrete', 'Beton Concrete'], ['island', 'Middengeleider / groen Island'], ['tactile', 'Met geleidelijn Tactile strip']];
  const surfaceKinds = [['bike', 'Fietspad rood asfalt Red bike path'], ['ped', 'Voetpad Footway'], ['bus', 'Busbaan Bus lane'], ['custom', 'Eigen kleur Custom']];
  const centerTypes = [['none', 'Geen asstreep — none'], ['centerDash', 'Asstreep 1-3 (bibeko)'], ['center39', 'Asstreep 3-9 (bubeko)'], ['centerSolid', 'Doorgetrokken asstreep'],
    ['centerMixed', 'Doorgetrokken + 3-1'], ['centerDouble', 'Dubbele asstreep'], ['median', 'Middenberm Median']];
  const arrowKinds = [['S', 'Rechtuitpijl Straight'], ['L', 'Linksafpijl Left'], ['R', 'Rechtsafpijl Right'], ['SL', 'Rechtdoor + links'], ['SR', 'Rechtdoor + rechts'],
    ['LR', 'Links + rechts'], ['SLR', 'Drierichtingenpijl'], ['U', 'Keren (≈ vishaakpijl)']];
  const colorOpts = [['white', 'Wit White'], ['yellow', 'Geel Yellow']];

  const typeNames = {
    road: 'Rijbaan 車道範圍 Road area', sidewalk: 'Trottoir/middengeleider 人行道/分隔島', surface: 'Verharding 彩色鋪面 Surface', section: 'Wegvak 路段 Road section',
    line: 'Streep 標線 Line', crosswalk: 'Oversteekplaats 行人穿越道 Crosswalk', stopline: 'Stopstreep 停止線 Stop line', scooterbox: 'OFOS 自行車停等區 Bike box',
    junction: 'Kruispunt 路口範圍 Intersection', roundabout: 'Rotonde 圓環 Roundabout', bikelane: 'Fietsstrook 自行車道 Bike lane', buslane: 'Busstrook 公車道 Bus lane', roundaboutTool: 'Rotonde 圓環',
    yield: 'Haaientanden 鯊魚齒讓路線', arrow: 'Pijl 指向線 Arrow', symbol: 'Symbool 圖示 Symbol', text: 'Tekst 路面文字 Text', chevron: 'Verdrijvingsvlak 槽化線', bump: 'Verkeersdrempel 減速丘 Speed bump', yellowbox: 'Afgekruist vak 網狀線', busstop: 'Bushalte 公車站 Bus stop',
  };

  const sec = (label, en, o) => ({ id: 'sec_' + label, label, en, mode: 'polyline', icon: { glyph: '═' },
    defaults: Object.assign({ type: 'section', lanesF: 1, lanesB: 1, laneWidth: 3.0, centerType: 'centerDash', medianWidth: 2, slowLane: 0, bikeLane: 0, edge: false, pave: false, smooth: true, autoArrows: true, autoBox: false, boxDepth: 4, solidLen: 20, laneUse: '', leftGuide: false, leftTurn: 'shared', pocketLen: 30, pocketTaper: 20 }, o) });
  const arrow = (k, g) => ({ id: 'arrow_' + k, label: arrowKinds.find((a) => a[0] === k)[1].split(' ')[0], en: 'Pijl 5,00 m', mode: 'point', icon: { glyph: g }, defaults: { type: 'arrow', kind: k, length: 5, dir: -Math.PI / 2 } });
  const text = (t, o) => ({ id: 'text_' + t, label: t, en: (o && o.en) || 'Tekst', mode: 'point', icon: { glyph: t.slice(0, 3) }, defaults: Object.assign({ type: 'text', text: t, charLen: 1.6, charWid: 0.45, charGap: 0.12, color: 'white', order: 'far', dir: -Math.PI / 2 }, o, { en: undefined }) });
  const chev = (id, label, en, o) => ({ id, label, en, mode: 'poly', icon: { glyph: '⫽' }, defaults: Object.assign({ type: 'chevron', color: 'white', border: 0.10, stripe: 0.20, gap: 2.0, dir: 0 }, o) });

  const library = [
    { title: 'Vlakken 區域 Areas', items: [
      { id: 'road', label: 'Rijbaan', en: 'Road area', mode: 'poly', icon: { fill: C.asphalt }, defaults: { type: 'road', tone: 'asphalt' } },
      { id: 'sidewalk', label: 'Trottoir', en: 'Sidewalk', mode: 'poly', icon: { fill: '#a7a49d' }, defaults: { type: 'sidewalk', style: 'pavers' } },
      { id: 'island', label: 'Middengeleider', en: 'Island / planter', mode: 'poly', icon: { fill: '#6c9a52' }, defaults: { type: 'sidewalk', style: 'island' } },
      { id: 'surf_bike', label: 'Rood fietspad', en: 'Red bike surface', mode: 'poly', icon: { fill: C.bike }, defaults: { type: 'surface', kind: 'bike', color: C.bike, edge: false } },
      { id: 'surf_bus', label: 'Busbaan', en: 'Bus surface', mode: 'poly', icon: { fill: C.bus }, defaults: { type: 'surface', kind: 'bus', color: C.bus, edge: false } },
    ] },
    { title: 'Wegen 路段 Roads', items: [
      sec('Erftoegangsweg 30', '30 km/h street, no centre line', { lanesF: 1, lanesB: 1, laneWidth: 2.75, centerType: 'none', autoArrows: false }),
      sec('GOW 50 met fietsstroken', 'Urban 50, bike lanes', { lanesF: 1, lanesB: 1, laneWidth: 3.0, centerType: 'centerDash', bikeLane: 1.7 }),
      sec('2×2 met middenberm', 'Dual 2+2, median', { lanesF: 2, lanesB: 2, laneWidth: 3.25, centerType: 'median', medianWidth: 3, edge: true }),
      sec('Eenrichtingsweg', 'One-way', { lanesF: 1, lanesB: 0, laneWidth: 3.5 }),
      sec('GOW 80 buiten', 'Rural 80', { lanesF: 1, lanesB: 1, laneWidth: 3.10, centerType: 'center39', edge: true }),
      { id: 'junction', label: 'Kruispunt', en: 'Intersection: click crossing', mode: 'junction', icon: { glyph: '✚' },
        defaults: { type: 'junctionTool', cwKind: 'ties', cwWidth: 4, setback: 3, stopGap: 1.5, crosswalks: true, stops: true, cornerR: 6, sidewalks: true, swWidth: 2.5, bikeCross: true } },
      { id: 'junction_pri', label: 'Zijweg (voorrang)', en: 'Side road gives way: click crossing', mode: 'junction', icon: { glyph: '┣' },
        defaults: { type: 'junctionTool', control: 'priority', minorCtrl: 'yield', cwMain: false, cwKind: 'ties', cwWidth: 4, setback: 3, stopGap: 1.5, crosswalks: false, stops: true, cornerR: 6, sidewalks: true, swWidth: 2.5, bikeCross: true } },
      { id: 'roundabout', label: 'Rotonde', en: 'Roundabout: click centre', mode: 'roundabout', icon: { glyph: '◎' },
        defaults: { type: 'roundaboutTool', bikeRing: true, bikeW: 2.0, bikeGap: 5, bikePrio: true, cornerR: 8, R: 18, lanes: 1, laneWidth: 5.5, apron: 2, island: 'island', yields: true, curvedYield: true, crosswalks: true, cwKind: 'ties', cwWidth: 4, cwSetback: 5, curveLanes: true, splitters: true, laneStop: true, solidApproach: false, solidLen: 20, stopLines: false, stopGap: 1.5 } },
      { id: 'turbo', label: 'Turborotonde', en: 'Turbo roundabout', mode: 'roundabout', icon: { glyph: '◉' },
        defaults: { type: 'roundaboutTool', turbo: true, bikeRing: false, bikeW: 2.0, bikeGap: 5, bikePrio: false, R: 24, lanes: 2, laneWidth: 5, apron: 0, divider: 'raised', island: 'island', yields: true, curvedYield: true, crosswalks: true, cwKind: 'ties', cwWidth: 4, cwSetback: 5, cornerR: 12, curveLanes: true, splitters: true, laneStop: true, solidApproach: false, solidLen: 20, stopLines: false, stopGap: 1.5 } },
    ] },
    { title: 'Strepen 標線 Lines', items: Object.entries(lineStyles).filter(([, s]) => !s.hidden).map(([k, s]) => ({ id: 'line_' + k, label: s.short || s.name, en: s.name + ' ' + s.en, mode: 'polyline', icon: { line: k }, defaults: { type: 'line', style: k, smooth: true } })) },
    { title: 'Kruispunt 路口 Junction', items: [
      { id: 'cw_ties', label: 'Zebrapad', en: 'Zebra crossing', mode: 'two', icon: { glyph: '▥' }, defaults: { type: 'crosswalk', kind: 'ties', width: 4, gap: 0.50, green: false } },
      { id: 'cw_lines', label: 'Kanalisatiestrepen', en: 'Signalised crossing lines', mode: 'two', icon: { glyph: '┆' }, defaults: { type: 'crosswalk', kind: 'lines', width: 4, green: false } },
      { id: 'yield', label: 'Haaientanden', en: 'Shark teeth (give way)', mode: 'two', icon: { glyph: '▽' }, defaults: { type: 'yield', lanes: 1, triangles: true } },
      { id: 'stopline', label: 'Stopstreep', en: 'Stop line', mode: 'two', icon: { glyph: '▬' }, defaults: { type: 'stopline', width: 0.30 } },
      { id: 'scooterbox', label: 'OFOS', en: 'Bike box (4–5 m)', mode: 'two', icon: { glyph: '▭' }, defaults: { type: 'scooterbox', depth: 4, side: '0.10', icon: true, text: '' } },
      { id: 'bump', label: 'Verkeersdrempel', en: 'Speed bump 30 km/h (across the road)', mode: 'two', icon: { glyph: '⩨' }, defaults: { type: 'bump', kind: 'bump', ramp: 1.0, top: 0.4, surface: 'pavers' } },
      { id: 'plateau', label: 'Plateau', en: 'Raised plateau (across the road)', mode: 'two', icon: { glyph: '▭' }, defaults: { type: 'bump', kind: 'plateau', ramp: 1.0, top: 6, surface: 'redbrick' } },
      { id: 'junction_uitrit', label: 'Uitrit (doorgaand trottoir)', en: 'Continuous sidewalk across a side street: click crossing', mode: 'junction', icon: { glyph: '┳' },
        defaults: { type: 'junctionTool', control: 'priority', contSidewalk: true, minorCtrl: 'yield', cwMain: false, cwKind: 'ties', cwWidth: 4, setback: 0, stopGap: 1.5, crosswalks: false, stops: true, cornerR: 1, sidewalks: true, swWidth: 2.5, bikeCross: false } },
      chev('verdrijf', 'Verdrijvingsvlak', 'Hatched area (bibeko)', { border: 0.10, stripe: 0.20, gap: 2.0 }),
      chev('verdrijf_bu', 'Verdrijvingsvlak bubeko', 'Hatched area (rural)', { border: 0.10, stripe: 0.50, gap: 3.0 }),
    ] },
    { title: 'Fiets & bus 自行車・公車', items: [
      { id: 'bike_strook', label: 'Fietsstrook', en: 'Bike lane, red', mode: 'polyline', icon: { fill: C.bike }, defaults: { type: 'bikelane', kind: 'exclusive', width: 1.7, twoWay: false, surface: true, sep: 'left', sepStyle: 'fiets11', spacing: 75, icons: true, diamonds: false, smooth: true } },
      { id: 'bike_sugg', label: 'Suggestiestrook', en: 'Advisory lane (no colour)', mode: 'polyline', icon: { glyph: '┊' }, defaults: { type: 'bikelane', kind: 'exclusive', width: 1.5, twoWay: false, surface: false, sep: 'left', sepStyle: 'fiets11', spacing: 75, icons: false, diamonds: false, smooth: true } },
      { id: 'bike_pad2', label: 'Fietspad 2 richtingen', en: 'Two-way cycle path', mode: 'polyline', icon: { fill: C.bike }, defaults: { type: 'bikelane', kind: 'exclusive', width: 3.0, twoWay: true, surface: true, sep: 'none', sepStyle: 'single', spacing: 75, icons: false, diamonds: false, smooth: true } },
      { id: 'bus_strook', label: 'Busstrook', en: 'Bus lane', mode: 'polyline', icon: { fill: C.bus }, defaults: { type: 'buslane', kind: 'exclusive', width: 3.25, surface: false, sep: 'left', sepStyle: 'single', diamonds: false, spacing: 50, text: 'BUS', smooth: true } },
      { id: 'bus_stop', label: 'Bushalte', en: 'Bus stop at the kerb (click start, end)', mode: 'two', icon: { glyph: '▤' }, defaults: { type: 'busstop', kind: 'roadside', bike: true, wP: 2.5, wb: 1.7, D: 3.0, Lin: 15, Lout: 12, Tb: 10, text: 'BUS' } },
      { id: 'bus_bay', label: 'Bushaltekom', en: 'Bus bay (click start, end)', mode: 'two', icon: { glyph: '◫' }, defaults: { type: 'busstop', kind: 'bay', bike: true, wP: 2.5, wb: 1.7, D: 3.0, Lin: 15, Lout: 12, Tb: 10, text: 'BUS' } },
    ] },
    { title: 'Pijlen 指向線 Arrows', items: [arrow('S', '↑'), arrow('L', '↰'), arrow('R', '↱'), arrow('SL', '⬉'), arrow('SR', '⬈'), arrow('LR', '⇄'), arrow('SLR', '⇈')] },
    { title: 'Tekst 文字 Text', items: [text('BUS', { en: 'RVV 81, 1,60 m' }), text('STOP', { en: 'bij bord B7' }), text('TAXI', { en: '1,60 m' }), text('LIJNBUS', { en: '1,60 m' }),
      text('30', { en: 'max. snelheid' }), text('50', { en: 'max. snelheid' })] },
    { title: 'Symbolen 圖示 Symbols', items: [
      { id: 'icon_bike', label: 'Fietssymbool', en: 'Bike symbol', mode: 'point', icon: { glyph: '自' }, defaults: { type: 'symbol', kind: 'bike', small: false, dir: -Math.PI / 2 } },
      { id: 'icon_tri', label: 'Voorwaarschuwingsdriehoek', en: 'Give-way ahead ▽ (1 × 4 m)', mode: 'point', icon: { glyph: '▽' }, defaults: { type: 'symbol', kind: 'warnTri', small: false, dir: -Math.PI / 2 } },
    ] },
  ];

  const T = {
    cwWidth: 'RBBV 2.2c: zebra ≥ 4,00 m', setback: '≈ afstand tot de kant van de kruisende rijbaan', stopGap: '≈ RBBV: stopstreep zo dat zicht op het verkeer is gewaarborgd',
    cornerR: '≈ bibeko 5–8 m', swWidth: '≈ trottoir ≥ 1,80 m', bikeCrossLabel: 'Fietsoversteek (blokken 0,50 m) Bike crossing',
    turnHead: 'Linksaf 左轉 Left turn', turnLabel: 'Linksaf', turnOpts: [['shared', 'Volgens de pijlen By lane arrows'], ['dedicated', 'Linker strook alleen linksaf Inner lane only'], ['banned', 'Verbod linksaf No left turn']],
    leftGuide: 'Geleidelijnen linksaf Left-turn guide lines', rightGuide: 'Geleidelijnen rechtsaf Right-turn guide lines',
    contSidewalk: 'Doorgaand trottoir (uitritconstructie) Continuous sidewalk',
    bumpKinds: [['bump', 'Verkeersdrempel Speed bump'], ['plateau', 'Plateau']], bumpRamp: 'RBBV 3.30 / ASVV: 20 / 30 / 50 km/h ≈ 0.7 / 1.0 / 2.4 m', bumpTop: '≈ drempel 0.3–1.0 m, plateau ≥ 4 m',
    bumpLaw: 'RBBV 3.30 taludmarkering: afwisselend korte en lange strepen evenwijdig aan de wegas, 0,10 m breed, tussenruimte 0,20 m, 0,40 / 1,00 m (≈ 2:5); bovenaan een streep van 0,20 m over de volle breedte',
        ctrlSignal: 'Verkeerslichten / stopstrepen overal', ctrlPriority: 'Voorrangskruispunt: zijweg verleent voorrang', minorOpts: [['yield', 'Haaientanden (RVV art. 80, bord B6)'], ['stop', 'Stopstreep + STOP (bord B7)']],
    priorityInfo: 'De weg met de meeste rijstroken loopt door: markering niet onderbroken, kantstreep onderbroken bij de zijweg. RBBV 2.2a: haaientanden op de ondergeschikte weg. The main road runs through.',
        pocketLen: 'RONA: deceleratie- + opstellengte', pocketTaper: 'RBBV 3.13: inleiding met verdrijfstrepen', laneWidth: 'RBBV 3.1: min. 2,75 m (bij uitzondering 2,60); linksafvak 0,50 m smaller (min. 2,50)',
    bikeLane: 'Fietsstrook breedte Width', bikeToggle: { label: 'Fietsstroken 自行車道 Bike lanes', on: 1.7 },
    bikeRing: { head: 'Fietspad 自行車道', label: 'Fietspad rondom 環狀自行車道 Cycle path around', width: 'Breedte Width', widthLaw: '≈ CROW: eenrichtingsfietspad 2,0–2,5 m',
      gap: 'Afstand tot rotonde Distance from ring', gapLaw: '≈ CROW: ± 5 m, ruimte voor één auto tussen rotonde en fietsoversteek', prio: 'Fietsers in de voorrang Bikes have priority (bibeko)',
      law: 'Fietsoversteek in de voorrang: rood, blokmarkering 0,50 × 0,50 m (RBBV 2.2c) met haaientanden voor het autoverkeer aan beide zijden; buiten de bebouwde kom fietsers uit de voorrang (alleen haaientanden voor fietsers ≈).' }, bikeLaneLaw: 'RBBV 3.7: fietsstrook ≥ 1,50 m', slowLane: false, edge: 'Kantstrepen Edge lines',
    autoArrows: 'Pijlen Lane arrows', box: 'OFOS fietsopstelstrook Bike box', boxDepth: 'OFOS-lengte Depth', boxDepthLaw: 'RBBV 3.18: 4,00–5,00 m; voor: stopstreep 0,30 m, achter: 2 × 0,15 m',
    solidLen: 'Doorgetrokken vóór stopstreep Solid before stop line', solidLenLaw: 'RBBV 3.17: deelstreep overgaand in doorgetrokken streep ≤ 10 of ≥ 20 m vóór de stopstreep', taper: '≈',
    arrowLen: 'RBBV 2.3: 5,00 m (≤ 50 km/h), 7,50 m (> 50 km/h), 2,50 m op fietspaden',
    arrowLaw: 'RBBV fig. 2.3.2 (5,00 m): rechtuit — schacht 0,15 m, kop 2,05 × 0,75 m; afbuigend — 45°-arm 0,71 m, kop 2,40 m, punt 0,30 m, 0,60 m naast de schacht; schacht 0,30 m uit het hart van de strook. Opeenvolgende pijlen 20–50 m (bibeko 15 m).',
    charLen: 'RBBV 2.3d: letterhoogte 1,60 m (≤ 50 km/h) of 4,00 m', charWid: '≈ BUS 1,62 m breed bij 1,60 m hoogte', charGap: '≈',
    textInfo: 'Woorden (BUS, STOP, TAXI) en getallen staan in één regel dwars op de rijstrook. Words are written across the lane.',
    textLaw: 'RBBV 2.3d: alleen STOP, BUS, TAXI en de geldende maximumsnelheid; STOP vóór de stopstreep bij bord B7; ≥ 0,20 m vrij aan weerszijden',
    yieldLabel: 'Haaientanden bij de ingangen Shark teeth', yieldTriangles: 'Haaientanden Shark teeth',
    yieldLaw: 'RVV art. 80 / RBBV 2.2a: driehoeken basis 0,50 m, hoogte 0,50 (bibeko) – 0,70 m, tussenruimte = basis; fietspaden 0,30 × 0,30 m; bij B6, niet bij verkeerslichten',
    rbR: '≈ CROW: enkelstrooksrotonde buitendiameter 32–40 m', rbLaw: 'Rotonde: voorrang op de rotonde met haaientanden (RVV art. 80); fietsers in de bebouwde kom vaak in de voorrang (rood fietspad + blokken). Turborotonde: rijstrookscheiders. Maten ≈ CROW.',
    turboRaised: 'Rijstrookscheiders Raised dividers', turboDouble: 'Dubbele streep Double line',
    busStopLaw: 'RBBV 3.10: bij de bushalte blijft de kantstreep doorlopen; langs de halte een kantstreep 0,10 m; "BUS" op de verharding ≈',
    bikeKinds: [['exclusive', 'Fietsstrook / fietspad Bike lane']], bikeW1: 'RBBV 3.7: ≥ 1,50 m', bikeW2: '≈ tweerichtingsfietspad ≥ 2,50 m', bikeSurface: 'Rood asfalt Red surface',
    bikeSepStyles: [['fiets11', 'Onderbroken 1-1 (fietsstrook)'], ['single', 'Doorgetrokken Solid'], ['double', 'Dubbel Double']], bikeSpacing: 'RBBV 3.7: fietssymbool om de 50–100 m en na elke zijweg',
    bikeLaw: 'RVV art. 1/23; RBBV 3.6–3.7: fietsstrook gescheiden door een doorgetrokken of onderbroken streep (1-1, 0,10 m), fietssymbolen; vaak rood. Tweerichtingsfietspad: as 0,30-2,70.',
    busSepStyles: [['single', 'Doorgetrokken 0,10 Solid'], ['fiets11', 'Onderbroken 1-1 (kruisbaar)']], busSpacing: 'RBBV 3.8: "BUS" om de 50–100 m (UV BABW: 25–50 m bibeko)',
    busLaw: 'RVV art. 81; RBBV 3.8: busstrook begrensd door een doorgetrokken streep ≥ 0,10 m, "BUS" aan het begin en na elke zijweg; waar gekruist moet worden 1-1 (kruispunt) of 3-9/1-3.',
    symbolKinds: [['bike', 'Fietssymbool Bike'], ['warnTri', 'Voorwaarschuwingsdriehoek ▽']], symbolLaw: 'RBBV 2.3d: voorwaarschuwingsdriehoek bij B6 — basis 1,00 m × 4,00 m (bibeko / strook < 2,75 m), 2,00 × 8,00 m bubeko',
    chevBorder: 'Kantstreep langs het vlak', chevStripe: 'RBBV 2.3b: 0,50 m (bibeko bij druppels 0,20 m)', chevGap: 'RBBV 2.3b: 3,00 m (bibeko 2,00 m), helling 1:2',
    chevLaw: 'RVV art. 77 / RBBV 2.3b: verdrijfstrepen, het vlak mag niet worden gebruikt',
  };

  window.RoadPresets.NL = {
    id: 'NL', name: 'Nederland Netherlands', driveSide: 'right',
    law: 'RVV 1990 / BABW; CROW Richtlijnen bebakening en markering van wegen',
    colors: C, lineStyles, crosswalk, stopLine, typeNames, library,
    fields: window.RoadPresetKit.makeFields({ lineStyles, crosswalk, stopLine, centerTypes, arrowKinds, colorOpts, sidewalkStyles, surfaceKinds, T, minorCtrl: 'yield', boxRange: [4, 5], arrowLenRange: [2.5, 7.5] }),
    fontFamily: '"Arial Narrow","Helvetica Neue Condensed","Roboto Condensed",Arial,sans-serif',
    arrowSet: 'NL', arrowLen: 5, tracedGlyphs: false,
    roadText: { len: 1.6, wid: 0.45, gap: 0.12, rowLen: 1.6, rowWid: 0.45, rowGap: 0.10 },
    busLaneText: 'BUS', busStop: { kerb: 'white', box: false, text: 'BUS' },
    yield: { style: 'teeth', base: 0.50, height: 0.50 },
    box: { front: 0, back: 0.15, backDouble: true, sides: false, fill: C.bike, icon: 'bike' }, boxRange: [4, 5],
    bikeCross: { line: 'blocks50', lineW: 0.50, gap: 0.50, minW: 1.5, pad: 1.0, symbols: false },
    iconSizes: { bike: [0.75, 1.5], warnTri: [1.0, 4.0] },
    twoStageBox: false, apronStyle: 'ribbed', mouthBikeLine: 'blocks50', stopText: 'STOP', minorCtrl: 'yield',
  };
})();
