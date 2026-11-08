# Road Plan Studio

Browser tool for drawing road redesigns over satellite images. Open `index.html` by double-clicking it, or run `python3 -m http.server 8765` in this folder and go to http://localhost:8765.

## Workflow
1. **Image**: open, drag in, or paste (⌘V) a satellite screenshot.
2. **Calibrate**: click two points a known distance apart (for example the two ends of the Google Maps scale bar) and type the length in metres. Every marking size is in metres, so this step matters.
3. **Road area** (車道範圍) and **sidewalks** (人行道): click the outline point by point. Finish with Enter, a double-click, or by clicking the first point.
4. **Markings**: pick presets from the library.
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

## Roundabouts
Draw road sections for the roads that meet, pick **圓環 (自動) Roundabout**, and click the centre (a preview follows the cursor). It draws the circulating roadway, a central island with a mountable apron, lane and edge lines, and for every road that reaches the circle: a §172 讓路線 (double dashed line with an inverted triangle per entry lane) and a crosswalk about one car length back. Each road bends into the ring with a curved kerb return (進出口轉角半徑 Corner radius, default 12 m): the paving fills the corner, the edge line follows the curve and the ring's edge line breaks exactly between the corners. From where each corner curve starts, the whole half of the road bends around the same centre as the kerb (車道彎入圓環 Curve lanes), so lane lines curve into the ring at constant width; the gap that opens between the two halves becomes a teardrop splitter island (分隔島 Splitter islands, with a tapered tail on roads without a median). The yield line runs from the splitter to the kerb along the bent lanes. On each leg, the road's own lane markings stop at the far side of the crosswalk (車道線止於行人穿越道, on by default). On multi-lane legs, solid lane lines continue from the crosswalk to the yield line (entries) or the ring (exits), bending with the lanes, and the last stretch of approach lane lines becomes solid 禁止變換車道線 (近圓環改實線, 30 m by default) so they start cleanly after the crosswalk. Circulating lane lines use the same number of dashes at the same angles on every lane circle, so they stay evenly spaced and aligned at any radius. Lane lines inside the circle are cut, medians end flush with the yield line, and medians are opened where crosswalks pass through them. Drag the centre to move it and the orange handle to change the radius; the yield lines and crosswalks follow (and follow edits to the roads), while keeping your own changes to them, such as a crosswalk's width or how far you moved it along its road. The circulating dimensions are typical design values, since the regulation has no roundabout figure.

**Curved yield lines**: at roundabouts the 讓路線 follows the edge of the circle, spanning every entry lane from the centre line to the road edge. Each lane gets its own triangle placed on that lane's path (curved approach roads included): tip toward approaching cars, base square to the lane's direction of travel. Turn it off for one roundabout (讓路線沿圓環弧線 in its panel) or for a single entry (沿圓環弧線 on that yield line).

**Turbo roundabout (渦輪圓環)**: two circulating lanes separated by a spiral divider (raised kerb or §167 double white line), so drivers choose a lane before entering and never change lanes on the ring. The spiral steps are centred on the main road and blended across its mouth: there the outer lane peels off as the exit and a new inner lane opens beside the island's nose for the entry. Adjust with 螺旋方向 Spiral angle and 過渡角 Transition. Entries, yield lines and crosswalks work the same as the normal roundabout.

The 讓路線 is also available on its own in ④ 路口 for T-junctions and minor-road entries.

## Linked pieces
Crosswalks, stop lines and yield lines made by the intersection or roundabout tools belong to it: deleting the intersection/roundabout deletes them too (⌘Z brings everything back). Select one and click **解除連動 Detach** to make it independent. A deleted roundabout piece is not re-created. Lane and edge lines are never drawn through a crosswalk, and medians are opened automatically wherever any crosswalk crosses them, so the opening follows the crosswalk's width and position.

## Editing shapes
Select a road area, sidewalk, road section or line: every segment shows a ⊕ handle at its middle. Drag it to add a new point there (it follows the curve on smooth sections). Alt+click a point to delete it.

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
