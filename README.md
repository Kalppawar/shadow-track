# Shadow Track

A browser-based shadow simulation tool for land plots and simple 3D objects, built for quick solar-shadow studies using plot geometry, object dimensions, month selection, and time-of-day controls.

## Features

- Plot editor with 4-corner polygon input
- Object support for cylinders and rectangular prisms
- Full-day sweep or single-time shadow simulation
- Month-based solar simulation
- Adjustable north reference, latitude, longitude, and timezone
- Plot export as PNG
- Project import/export as JSON
- Responsive UI with dark mode

## Project status

This repository is an early open source frontend package and still depends on companion modules such as `validators.js`, `shadowMath.js`, and `plotRenderer.js` to run fully.

## Stack

- HTML
- CSS
- JavaScript (ES modules)
- Plotly
- SunCalc
- SortableJS

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/shadow-track.git
cd shadow-track
```

### 2. Serve locally

Because the app uses ES modules, serve it with a local HTTP server instead of opening `index.html` directly.

Using Python:

```bash
cd frontend
python -m http.server 3000
# or use
# npx serve ./
```

Then open `http://localhost:3000` in your browser.

## Current structure

```text
shadow-track/
├── frontend/
│   ├── index.html
│   ├── style.css
|   ├── plotRenderer.js
|   ├── shadowMath.js
|   ├── validators.js
│   └── app.js
├── .github/
│   ├── ISSUE_TEMPLATE/
|       ├── bug_report.md
|       └── feature_request.md
│   └── pull_request_template.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── SUPPORT.md
└── README.md
```

## Roadmap

- Add the missing runtime modules
- Add sample project files
- Add unit tests for geometry and solar calculations
- Add CI checks for linting and formatting
- Add a production demo build
- Add documentation screenshots and GIFs

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Security

Please read [SECURITY.md](./SECURITY.md) for responsible disclosure guidance.

## Support

Please read [SUPPORT.md](./SUPPORT.md) for help and usage guidance.

## License

This project is released under the MIT License. See [LICENSE](./LICENSE).


## GitHub Pages

Yes, this project can be hosted on GitHub Pages because it is a static frontend built with HTML, CSS, and JavaScript modules.

For it to run properly on GitHub Pages:

- Keep the current relative import paths unchanged
- Upload the full repository contents, including all frontend module files
- Serve the `frontend/` directory as the published site root, or move its contents to the repository root before publishing
- Test once after deployment because browser behavior, module loading, and Plotly rendering should be verified in the hosted environment

If you use a project site like `username.github.io/repo-name/`, relative module imports will still work as long as the files remain together in the same published folder.
