# Inspection images

The viewer reads pictures **only** from `manifest.json` in this folder. Nothing else (no seed field, no hard-coded path) decides
which image a finding shows.

Each entry: `id`, `class` (a defect class id from `domain/config.js`), `file` (relative to this folder, 4:3, at most 1024 px wide),
`bbox` (`x, y, w, h` as fractions of the image), `bboxSource` (`dataset` = the source's own annotation, `drawn` = drawn by hand),
`source`, `pageUrl`, `author`, `licence`, `licenceUrl`, and `provenance`:

- `reference`: a real photograph of this kind of defect from somewhere else. Screens say "Reference photo · author, source, licence · not from this asset".
- `placeholder`: no real image for the class yet (`file` is null). Screens say "Placeholder – no real image yet".

A finding gets the image of its class (the class the AI proposed); with several images the same finding always gets the same one.

**To use your own inspection images:** copy a web-sized 4:3 JPEG into `<class>/`, change that entry's `file`, `bbox`, `source`,
`author`, `licence` and set `provenance` to `reference` (or add a new provenance value and handle it in `app/evidence.js`
if you want a different caption). The unit test `test/evidence.test.js` checks every entry: file exists, credit present, licence in the
allowed list (CC0, CC BY, CC BY-SA, public domain; never NC or ND), box inside the image, no stray files.

Credits for every image and the classes still on placeholder: `docs/image-sources.md` (kept out of git with the rest of `docs/`) and the
"Image credits" section at the bottom of the finding viewer.
