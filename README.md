# NEXUS OS

Static site for the NEXUS OS asset reliability platform. Pages, images, and video are served as files. Sign-in is handled in the browser.

## Local

```bash
npm start
```

Open http://localhost:3000.

## Vercel

Vercel runs `npm run build`, which copies the site into `public/`. `server.js` is only the local preview server. Clean URLs are on, and `/blogs`, `/about`, and `/case-studies` redirect to the homepage.
