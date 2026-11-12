# Leaflet (vendored)

Leaflet 1.9.4, `dist/leaflet.js`, `dist/leaflet.css` and `dist/images/`, copied unchanged from the npm package
`leaflet@1.9.4`, with its LICENSE (BSD-2-Clause). No CDN: the page loads these files from the site itself.

Used only by the Risk Map (`reliability/js/app/mapScreen.js`), and loaded on demand, so pages that never open
the map do not download it. Map tiles are the one thing that comes from outside: see `CONFIG.map` in
`reliability/js/domain/config.js`. When tiles fail to load the map shows lines and towers on a plain background.
