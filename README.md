# Road Plan Studio

Browser tool for drawing road redesigns over satellite images. Open `index.html` by double-clicking it, or run `python3 -m http.server 8765` in this folder and go to http://localhost:8765.

## Workflow
1. **Image**: open, drag in, or paste (⌘V) a satellite screenshot.
2. **Calibrate**: click two points a known distance apart (for example the two ends of the Google Maps scale bar) and type the length in metres. Every marking size is in metres, so this step matters.
3. **Road area** (車道範圍) and **sidewalks** (人行道): click the outline point by point. Finish with Enter, a double-click, or by clicking the first point.
4. **Markings**: pick presets from the library. Click a group heading to open it (only one group is open at a time, so the panel fits without scrolling). **◀** hides the whole panel (**▶** brings it back). Choosing a tool opens its group automatically.
   - *Road sections* (路段): click along the road centreline and the tool generates all the lanes. Lanes on the right of your drawing direction carry forward traffic.
   - *Crosswalks / stop lines / scooter boxes*: click from one kerb to the other. They line up with the nearest lane's direction of travel automatically.
   - *Arrows / text*: click to place. They face the direction of traffic in the nearest lane.
5. **Save** the project (.json, includes the image) and **Export PNG**.

Sidewalks always draw on top of markings, so a crosswalk that runs into a sidewalk is hidden under it. Markings are clipped to the road area; you can turn that off in the top bar.

## Intersections
1. Draw a **road section** (② 路段) along the centre line of each road, running straight through the junction.
2. Pick **路口 (自動) Intersection** and click where the roads cross.
3. It builds the junction area (lane lines and road-section medians are cut inside it; medians end at the crosswalk with a curb), a crosswalk on every leg set back 3 m from the crossing road's edge (§185), and stop lines on the incoming half of each leg, 2 m behind the crosswalk (§170). Four-way, T and skewed junctions all work; one-way legs only get a stop line on the side traffic arrives from.
4. Everything it makes is a normal object you can edit, move or delete. Drag the purple dashed junction outline's corners to change where lane lines stop (it is not exported).

**Automatic junction markings** — modelled on a typical Taiwan approach: one stop line across all entering lanes 2 m before the crosswalk; the 機慢車停等區 right behind it over the through lanes only (cars stop at its back edge); lane lines solid (禁止變換車道線) for 30 m before the stop line, then dashed; arrows matching each lane's use. Set a road's **車道用途 Lane use** from the driver's left, e.g. `L,L,S,S,R` (blank = automatic). Each road section has options (arrows and box on by default): 自動指向線 lane arrows (§188, chosen per lane from the turns that junction allows, repeated 30 m back per §176), 機慢車停等區 scooter boxes (§174-2, between the stop line and the crosswalk; the car stop line moves back behind it) and 左轉導引線 left-turn guide lines through the junction. The intersection tool applies them, and the intersection rebuilds its markings automatically whenever one of its roads changes (shape, lanes, lane use or these options). Arrows sit 1 m behind the stop line on lanes without a scooter box and 3 m behind the box on the others; the second set (§176) lines up across all lanes just past the solid lane lines.

**Left-turn designs** (per road, 左轉設計): 共用車道 shared (直左), 左轉專用車道 dedicated inner lane, 左轉附加車道 pocket with a taper (length and taper adjustable): cut from the median on a two-way road, or, on a one-way road such as a fast/slow road's main carriageway, made by widening the road on the driver's left, which opens any island drawn there. When a road's lane design changes, its arrows, lane lines and scooter boxes are rebuilt to match; crosswalks, stop lines and sidewalks keep your edits. The other designs: 機慢車兩段式左轉 two-stage with a 待轉區 box at the far-right corner (§191), and 禁止左轉 no left turn.

**Fast/slow roads and divided boulevards** (快慢分隔道路): draw each carriageway as its own section: the main road, plus a one-way slow road (or bus road) on each side, separated by islands. Then click the intersection once where any of them crosses the cross street. Every carriageway that crosses the street nearby joins the same intersection. Their crosswalks and stop lines line up on one crossing line, each carriageway gets its own stop line, scooter box and arrows, and the cross street's crosswalks sit outside the outermost carriageway. Rounded corners and sidewalks form only at the outer edges. Left-turn guide lines lead from the main road's left-turn lane into the cross street.

**Your own crosswalks**: untick 自動行人穿越道 Crosswalks on the junction tool before clicking, or on an existing intersection's panel. The intersection then adds no crosswalks, and each approach's stop line goes 2–3 m (停止線淨距) behind the crosswalk you drew on that approach. Approaches without one keep the setback.

**Corners and sidewalks** (on the intersection, editable afterwards): 轉角半徑 corner radius rounds every kerb corner and paves the curve; 轉角人行道 corner sidewalks (width adjustable) follow each road's kerb out to halfway to the next intersection, and open wherever another road (ramp, slip road, driveway) crosses them. Where any road at the junction has bike lanes, the bike lanes stop at the crosswalk and a §186-1 自行車穿越道線 (two 10 cm white lines ≥ 1.2 m apart, bike symbols at both ends) runs beside each crosswalk.

**Lane additions and drops**: a road section can change its lane count part-way: set 後段車道數 lanes after change, 變化起點 where the taper starts (m from the first point) and 漸變段長 taper length. Added lanes open on the kerb side; the kerb, bike lane and edge line follow the taper, and an intersection uses the lane count at its own position (lane arrows and solid lines stay out of the taper).

**Ramps and slip roads**: where two road sections overlap outside an intersection, the one with fewer lanes gives way: its lines stop at the bigger road's edge, and the bigger road's edge line (and bike-lane separator) becomes a dashed line across the mouth.

**Your changes survive rebuilds**: an intersection rebuilds its markings whenever one of its roads changes. Pieces you deleted stay deleted, and pieces you moved or edited stay as you left them; only the untouched pieces are rebuilt. The intersection's **↻ 重新產生 Regenerate** button starts over from scratch. 解除連動 Detach takes a piece out of the intersection for good.

## Roundabouts
Draw road sections for the roads that meet, pick **圓環 (自動) Roundabout**, and click the centre (a preview follows the cursor). It draws the circulating roadway, a central island with a mountable apron, lane and edge lines, and for every road that reaches the circle: a §172 讓路線 (double dashed line with an inverted triangle per entry lane) and a crosswalk about one car length back. Each road bends into the ring with a curved kerb return (進出口轉角半徑 Corner radius, default 12 m): the paving fills the corner, the edge line follows the curve and the ring's edge line breaks exactly between the corners. From where each corner curve starts, the whole half of the road bends around the same centre as the kerb (車道彎入圓環 Curve lanes), so lane lines curve into the ring at constant width; the gap that opens between the two halves becomes a teardrop splitter island (分隔島 Splitter islands, with a tapered tail on roads without a median). The yield line runs from the splitter to the kerb along the bent lanes. On each leg, the road's own lane markings stop at the far side of the crosswalk (車道線止於行人穿越道, on by default). On multi-lane legs, solid lane lines continue from the crosswalk to the yield line (entries) or the ring (exits), bending with the lanes, Each entry is treated like an intersection approach: a linked §170 stop line 2 m before the crosswalk (停止線, gap adjustable 1–3 m), entry lane lines ending with a full dash at the stop line and exit lane lines starting with a full dash after the crosswalk, blended into the road's own dash pattern. Solid 禁止變換車道線 on the approach (近圓環改實線) is available but off by default. Circulating lane lines use the same number of dashes at the same angles on every lane circle, so they stay evenly spaced and aligned at any radius. Lane lines inside the circle are cut, medians end flush with the yield line, and medians are opened where crosswalks pass through them. Drag the centre to move it and the orange handle to change the radius; the yield lines and crosswalks follow (and follow edits to the roads), while keeping your own changes to them, such as a crosswalk's width or how far you moved it along its road. The circulating dimensions are typical design values, since the regulation has no roundabout figure.

**Curved yield lines**: at roundabouts the 讓路線 follows the edge of the circle, spanning every entry lane from the centre line to the road edge. Each lane gets its own triangle placed on that lane's path (curved approach roads included): tip toward approaching cars, base square to the lane's direction of travel. Turn it off for one roundabout (讓路線沿圓環弧線 in its panel) or for a single entry (沿圓環弧線 on that yield line).

**Turbo roundabout (渦輪圓環)**: two circulating lanes separated by a spiral divider (raised kerb or §167 double white line), so drivers choose a lane before entering and never change lanes on the ring. The spiral steps are centred on the main road and blended across its mouth: there the outer lane peels off as the exit and a new inner lane opens beside the island's nose for the entry. Adjust with 螺旋方向 Spiral angle and 過渡角 Transition. Entries, yield lines and crosswalks work the same as the normal roundabout.

The 讓路線 is also available on its own in ④ 路口 for T-junctions and minor-road entries.

**Kerb lines**: around a roundabout the edge line is traced once along the outline of the whole paved area (ring + curved corners + joining roads), 0.225 m inside it, so it stays a single continuous line however the roads meet the ring.

## Linked pieces
Crosswalks, stop lines and yield lines made by the intersection or roundabout tools belong to it: deleting the intersection/roundabout deletes them too (⌘Z brings everything back). Select one and click **解除連動 Detach** to make it independent. A deleted roundabout piece is not re-created. Lane and edge lines are never drawn through a crosswalk, and medians are opened automatically wherever any crosswalk crosses them, so the opening follows the crosswalk's width and position.

## Editing shapes
- **Areas** (road area, sidewalk, island, coloured surface, 槽化線, 網狀線): every edge has a ◆ handle at its middle. Drag it to bend that edge into a curve, like reshaping a path in Inkscape (Shift keeps the bulge centred; Alt+click the ◆ to straighten it again). Double-click an edge to add a corner point.
- **Lines and road sections**: drag the ⊕ handle in the middle of a segment to add a point there (it follows the curve on smooth sections).
- Alt+click a point to delete it.

## Trapezoid crosswalks
Set a crosswalk's 形狀 Shape to 梯形 Trapezoid, then drag its four corners to fit odd-shaped junctions. 枕木紋 bars stay parallel to traffic, 40 cm wide with the same legal gap between every pair (as in Japan's trapezoid crossings); only their length changes, ending on the slanted edges, and slivers at a slanted side are left out; 斑馬紋 edge lines follow the slanted edges. The green base, median openings, lane-line cut-outs, ＋停止線 and alignment all follow the shape. (A roundabout's crosswalk becomes independent when made a trapezoid.)

## Bike lanes
Pick 自行車道, 雙向自行車道 or 自行車優先 and draw along the lane's centre line (straight or curved). The standard lane has a brick-red surface (§174), a thin white solid line along each edge and bike symbols (§183-1). In its panel, 邊線 Edge lines can switch to the §174 雙白實線 separator (left, right or both) and 菱形標記 adds the 2.5 × 1.0 m diamonds every 30–60 m. Priority lanes get two white solid lines (§174-4). Bike lanes are visible on any surface (road, sidewalk or bare image). Road lane lines underneath give way, and the markings break at crosswalks. Widths follow the design manual (≈ one-way ≥ 1.2 m, two-way ≥ 2.5 m).

**Bus lanes** (公車專用道, kerbside or median,) work the same way and follow §174/§175: a white diamond (2.5 × 1.0 m, 15 cm line) at the start and every 30–60 m, 「公車專用」 written along the lane between diamonds, 雙白實線 separation, or 單邊禁止變換車道線 where buses may move out. A coloured surface is optional (the regulation doesn't specify one). A bus lane paves itself and counts as road surface, so it shows even where no road area has been drawn. Bus and bike lane markings break at intersections and crosswalks: each piece starts again with a diamond (§174: re-marked after every intersection), and the 「公車專用」 wording is always whole. It's repeated just before the next intersection, and on a short piece it goes right after the diamond.

**Bus stops** (自行車・公車道 group): click the start and end of the stop beside a road section; the stop attaches to that road's kerb and follows it when the road changes. Drag either end to change its length.
- **公車站 路側 Kerbside stop**: the bus stops in its lane, so it never has to pull in. A boarding island sits at the kerb and the bike lane runs behind it, with a short crossing for passengers, so riders and waiting passengers don't meet.
- **公車站 港灣式 Bus bay**: the bus turns right into a recess (entry taper, berth, exit taper) and rejoins traffic afterwards. The lane edge becomes dashed across the bay mouth. The waiting platform is on the sidewalk side, and the bike lane runs behind it.
- 自行車道繞行後方 (on by default) routes the bike lane behind the stop. If the road has its own bike lane, that lane is interrupted and curves out to the detour and back; if it has none, the bike lane and platform run straight behind the stop.
- **Joining bike lanes**: the open ends of a stop's bike lane are snap points. A bike lane drawn (or dragged) to one joins it: it leaves in the stop's direction, takes its width, follows the stop when the stop or its road moves, and is drawn together with the stop's bike lane as one continuous lane. Drag the end away to detach. A bike lane you drew along the kerb that runs past both ends of a stop is detoured automatically: it is hidden along the stop, and the stop's bike lane curves out from it and back.
- Markings follow the regulation where it has one: §190 停靠區 box (white 10 cm lines) with white wording (default 「公車停靠區」), §169 red 禁止臨時停車線 on the stop's kerb, and §174-4 (no bike markings within 2 m of the stop). Bay depth, tapers, island and bike-lane widths aren't set by the regulation; the defaults are marked ≈ and adjustable.

## Aligning and the magnet
- **Align (A)**: select a crosswalk, stop line, scooter box, arrow, text or icon, press **A** (or click 📐 對齊至…), then click the object to line it up with. A stop line aligned to a crosswalk becomes parallel and sits the §170 2.0 m edge-to-edge gap away. The panel then offers left / centre / right and top / middle / bottom alignment, measured either in the target's frame (up = direction of travel, left/right = the driver's left/right) or in screen directions. Any object can be aligned this way; crosswalks, stop lines, boxes, arrows, text and icons can also take the target's direction.
- **🧲 Magnet** (top bar): while drawing, dragging or rotating, angles lock to horizontal, vertical, or parallel/perpendicular to the nearest lane within 3°, and points snap to existing corners. Hold Alt to turn it off for one move.
- Dragging a crosswalk end keeps it square to traffic. Use the orange rotate handle to turn the whole crosswalk, stop line or box.

## Regulation shapes
Arrows follow the §188 figures (直線, 弧形 R=2.0/1.2, 分岔 圖三–圖五, 5.0 m long). The characters 慢 停 禁行機車 公車/機車/大客車/大貨車/自行車/高乘載專用 直行/左彎/右彎專用 and the 機車/自行車 icons are traced from the official figure files, at 1.0 × 2.5 m cells, 1.0 m apart, read far to near (§150). Characters not in that set fall back to a bold font in the same cell. The U-turn arrow has no figure in the regulation and is an approximation.

## Layers (drawing order)
The 圖層 Layers list is the drawing order: items higher in the list are drawn on top. Use ↑ / ↓ to move anything above or below anything else. For example, put a bus lane or marking above a sidewalk, or a road above the markings it should cover.
- The list stays at the bottom of the right panel. Items are numbered per kind (人行道 1, 人行道 2 …). Selecting something on the canvas highlights its row and scrolls to it.
- Pieces an intersection or roundabout generated are grouped under it: ▸ shows them, and ↑ / ↓ or the lock on the group row act on the whole group.
- The padlock locks an item (or a group). A locked item can't be picked on the canvas, dragged, nudged or deleted. Select it from the list to change its settings or unlock it.
- New items go to the top of their kind's default level. Bottom to top, the levels are: road pieces (areas, sections, roundabouts, intersections); bus lanes and coloured surfaces; markings; sidewalks and islands; bus stops; bike lanes. So by default crosswalks still run under sidewalks.
- Pieces an intersection rebuilds keep the places you gave them.
- Projects saved before this change are sorted into those levels once when opened, so they look the same.
- Road pieces next to each other in the list are paved together, without seams. Markings are always clipped to road surface, and the automatic cut-outs (intersections, crosswalks, medians, bus stops) apply whatever the order.

## Shortcuts
V select · H pan (or hold Space) · M measure · ⌘/Ctrl+scroll or pinch to zoom · Enter finish · Esc cancel · ⌫ remove the last point or delete · ⌘Z / ⇧⌘Z · ⌘D duplicate · [ ] rotate · F flip · A align to another object · Shift snaps to 15° angles · Alt turns off point snapping · double-click an edge to add a vertex · Alt+click a vertex to delete it

## Country presets
Each country's rules live in `js/presets/<country>.js`, which holds line styles, law ranges, the library, and the property fields. Taiwan (`taiwan.js`) follows 道路交通標誌標線號誌設置規則 (全國法規資料庫 version amended 2026-03-11 / 民國115年3月11日). Every value with a § article reference was checked against the regulation text. Values marked ≈ are ones the regulation does not specify (arrow length, size of most road text), so they are typical defaults. To add a country, copy `taiwan.js`, change the values, and register it under a new id.
