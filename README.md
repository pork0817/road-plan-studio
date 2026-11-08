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

## Shortcuts
V select · H pan (or hold Space) · M measure · ⌘/Ctrl+scroll or pinch to zoom · Enter finish · Esc cancel · ⌫ remove the last point or delete · ⌘Z / ⇧⌘Z · ⌘D duplicate · [ ] rotate · F flip · Shift snaps to 15° angles · Alt turns off point snapping · double-click an edge to add a vertex · Alt+click a vertex to delete it

## Country presets
Each country's rules live in `js/presets/<country>.js`, which holds line styles, law ranges, the library, and the property fields. Taiwan (`taiwan.js`) follows 道路交通標誌標線號誌設置規則 (全國法規資料庫 version amended 2026-03-11 / 民國115年3月11日). Every value with a § article reference was checked against the regulation text. Values marked ≈ are ones the regulation does not specify (arrow length, size of most road text), so they are typical defaults. To add a country, copy `taiwan.js`, change the values, and register it under a new id.
