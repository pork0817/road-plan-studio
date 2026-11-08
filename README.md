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

**Left-turn designs** (per road, 左轉設計): 共用車道 shared (直左), 左轉專用車道 dedicated inner lane, 左轉附加車道 pocket cut from the median with a taper (length and taper adjustable; width limited by the median), 機慢車兩段式左轉 two-stage with a 待轉區 box at the far-right corner (§191), and 禁止左轉 no left turn.

**Corners and sidewalks** (on the intersection, editable afterwards): 轉角半徑 corner radius rounds every kerb corner and paves the curve; 轉角人行道 corner sidewalks (width adjustable) follow each road's kerb out to halfway to the next intersection, and open wherever another road (ramp, slip road, driveway) crosses them. Where any road at the junction has bike lanes, the bike lanes stop at the crosswalk and a §186-1 自行車穿越道線 (two 10 cm white lines ≥ 1.2 m apart, bike symbols at both ends) runs beside each crosswalk.

**Lane additions and drops**: a road section can change its lane count part-way: set 後段車道數 lanes after change, 變化起點 where the taper starts (m from the first point) and 漸變段長 taper length. Added lanes open on the kerb side; the kerb, bike lane and edge line follow the taper, and an intersection uses the lane count at its own position (lane arrows and solid lines stay out of the taper).

**Ramps and slip roads**: where two road sections overlap outside an intersection, the one with fewer lanes gives way: its lines stop at the bigger road's edge, and the bigger road's edge line (and bike-lane separator) becomes a dashed line across the mouth.

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
Set a crosswalk's 形狀 Shape to 梯形 Trapezoid, then drag its four corners to fit odd-shaped junctions. 枕木紋 bars fan out across it and stay 40 cm wide at the legal gap; 斑馬紋 edge lines follow the slanted edges. The green base, median openings, lane-line cut-outs, ＋停止線 and alignment all follow the shape. (A roundabout's crosswalk becomes independent when made a trapezoid.)

## Bike lanes
Pick 🚲 自行車專用車道, 雙向自行車道 or 自行車優先車道 and draw along the lane's centre line (straight or curved). The lane builds itself: brick-red surface and 雙白實線 separator (§174), 2.5 × 1.0 m diamonds every 30–60 m, bike icons (§183-1); priority lanes get two white solid lines (§174-4). Bike lanes are visible on any surface (road, sidewalk or bare image). Road lane lines underneath give way, and the markings break at crosswalks. Widths follow the design manual (≈ one-way ≥ 1.2 m, two-way ≥ 2.5 m).

**Bus lanes** (公車專用道, kerbside or median,) work the same way and follow §174/§175: a white diamond (2.5 × 1.0 m, 15 cm line) at the start and every 30–60 m, 「公車專用」 written along the lane between diamonds, 雙白實線 separation, or 單邊禁止變換車道線 where buses may move out. A coloured surface is optional (the regulation doesn't specify one).

## Aligning and the magnet
- **Align (A)**: select a crosswalk, stop line, scooter box, arrow, text or icon, press **A** (or click 📐 對齊至…), then click the object to line it up with. A stop line aligned to a crosswalk becomes parallel and sits the §170 2.0 m edge-to-edge gap away. The panel then offers left / centre / right and top / middle / bottom alignment, measured either in the target's frame (up = direction of travel, left/right = the driver's left/right) or in screen directions. Any object can be aligned this way; crosswalks, stop lines, boxes, arrows, text and icons can also take the target's direction.
- **🧲 Magnet** (top bar): while drawing, dragging or rotating, angles lock to horizontal, vertical, or parallel/perpendicular to the nearest lane within 3°, and points snap to existing corners. Hold Alt to turn it off for one move.
- Dragging a crosswalk end keeps it square to traffic. Use the orange rotate handle to turn the whole crosswalk, stop line or box.

## Regulation shapes
Arrows follow the §188 figures (直線, 弧形 R=2.0/1.2, 分岔 圖三–圖五, 5.0 m long). The characters 慢 停 禁行機車 公車/機車/大客車/大貨車/自行車/高乘載專用 直行/左彎/右彎專用 and the 機車/自行車 icons are traced from the official figure files, at 1.0 × 2.5 m cells, 1.0 m apart, read far to near (§150). Characters not in that set fall back to a bold font in the same cell. The U-turn arrow has no figure in the regulation and is an approximation.

## Shortcuts
V select · H pan (or hold Space) · M measure · ⌘/Ctrl+scroll or pinch to zoom · Enter finish · Esc cancel · ⌫ remove the last point or delete · ⌘Z / ⇧⌘Z · ⌘D duplicate · [ ] rotate · F flip · A align to another object · Shift snaps to 15° angles · Alt turns off point snapping · double-click an edge to add a vertex · Alt+click a vertex to delete it

## Country presets
Each country's rules live in `js/presets/<country>.js`, which holds line styles, law ranges, the library, and the property fields. Taiwan (`taiwan.js`) follows 道路交通標誌標線號誌設置規則 (全國法規資料庫 version amended 2026-03-11 / 民國115年3月11日). Every value with a § article reference was checked against the regulation text. Values marked ≈ are ones the regulation does not specify (arrow length, size of most road text), so they are typical defaults. To add a country, copy `taiwan.js`, change the values, and register it under a new id.
