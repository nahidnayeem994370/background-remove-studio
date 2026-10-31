# Background Remove Studio

A free, responsive image-editing website built with plain **HTML, CSS and JavaScript**. No framework, build step, account, or paid API is required.

## Tools

1. **Background Remove** — AI-powered subject/background separation using the open-source browser package `@imgly/background-removal`.
2. **Background Changer** — removes the background with browser AI, then applies a chosen solid color.
3. **Image Resize** — resize to custom pixel dimensions with optional aspect-ratio locking.
4. **Image Compress** — export as JPEG with adjustable quality.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static web server. Example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes

- The compact AI model is preloaded automatically when the page opens (about 40 MB). It is cached by the visitor’s browser for later visits. An internet connection is required for the first download on each device/browser.
- AI processing runs in the browser; there is no paid background-removal API. Performance depends on the device and available memory. Large images may take time or fail on low-memory phones.
- Resize, compress and background composition use the browser Canvas API.
- This static website can be deployed on GitHub Pages or any static hosting provider.
- The website does not upload images to a project server by design. A CDN delivers the open-source AI library and model assets.
