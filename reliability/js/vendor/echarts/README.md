# ECharts (vendored)

Apache ECharts 5.6.0, `dist/echarts.min.js`, copied unchanged from the npm package `echarts@5.6.0`
with its LICENSE (Apache-2.0) and NOTICE. No CDN: the page loads this file from the site itself.

Used only for the trend charts in the Asset 360 panel (health index history, DGA gas trends,
transformer loading). The rest of the page keeps the legacy SVG helpers.
It is loaded on demand by `reliability/js/app/charts.js`, so pages that never open the panel never download it.
