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

## Aligning and the magnet
- **Align (A)**: select a crosswalk, stop line, scooter box, arrow, text or icon, press **A** (or click 📐 對齊至…), then click the object to line it up with. A stop line aligned to a crosswalk becomes parallel and sits the §170 2.0 m edge-to-edge gap away; the gap and "match ends" can be adjusted in the panel. Arrows, text and icons take the target's direction and can sit on its centre line.
- **🧲 Magnet** (top bar): while drawing, dragging or rotating, angles lock to horizontal, vertical, or parallel/perpendicular to the nearest lane within 3°, and points snap to existing corners. Hold Alt to turn it off for one move.
- Dragging a crosswalk end keeps it square to traffic. Use the orange rotate handle to turn the whole crosswalk, stop line or box.

## Regulation shapes
Arrows follow the §188 figures (直線, 弧形 R=2.0/1.2, 分岔 圖三–圖五, 5.0 m long). The characters 慢 停 禁行機車 公車/機車/大客車/大貨車/自行車/高乘載專用 直行/左彎/右彎專用 and the 機車/自行車 icons are traced from the official figure files, at 1.0 × 2.5 m cells, 1.0 m apart, read far to near (§150). Characters not in that set fall back to a bold font in the same cell. The U-turn arrow has no figure in the regulation and is an approximation.

## Shortcuts
V select · H pan (or hold Space) · M measure · ⌘/Ctrl+scroll or pinch to zoom · Enter finish · Esc cancel · ⌫ remove the last point or delete · ⌘Z / ⇧⌘Z · ⌘D duplicate · [ ] rotate · F flip · A align to another object · Shift snaps to 15° angles · Alt turns off point snapping · double-click an edge to add a vertex · Alt+click a vertex to delete it

## Country presets
Each country's rules live in `js/presets/<country>.js`, which holds line styles, law ranges, the library, and the property fields. Taiwan (`taiwan.js`) follows 道路交通標誌標線號誌設置規則 (全國法規資料庫 version amended 2026-03-11 / 民國115年3月11日). Every value with a § article reference was checked against the regulation text. Values marked ≈ are ones the regulation does not specify (arrow length, size of most road text), so they are typical defaults. To add a country, copy `taiwan.js`, change the values, and register it under a new id.
