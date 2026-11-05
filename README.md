# Liquid Glass Forge

A rendering engine for refractive glass on the web. Use a readable image, canvas,
video, or pixel source to bend the content behind ordinary HTML controls.
Integrate it with vanilla JavaScript, React, Vue, or Angular.

[![A glass lens moving across text and bending the lettering underneath](docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/#playground)

[Live playground](https://namipsg.github.io/liquid-glass-forge/#playground) ·
[Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) ·
[Framework and device support](https://namipsg.github.io/liquid-glass-forge/support.html) ·
[API documentation](#documentation)

[![npm preview](https://img.shields.io/npm/v/%40liquid-glass-forge%2Fdom/next?label=npm%20preview)](https://www.npmjs.com/package/@liquid-glass-forge/dom/v/0.1.0-rc.1)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://github.com/namipsg/liquid-glass-forge/actions/workflows/pages.yml/badge.svg)](https://github.com/namipsg/liquid-glass-forge/actions/workflows/pages.yml)

## What it does

- **WebGL2 and CPU optics.** Refraction, blur, color dispersion, tint, and rim light over explicit pixel sources. CPU rendering supports an optional worker and bounded update rates.
- **Native controls.** The optical layer is decorative. Buttons, inputs, links, and text stay in the DOM with their normal keyboard and accessibility behavior.
- **Material fallbacks.** Use a CSS backdrop material or opaque surface when an optical source is unavailable or the interface calls for more contrast.
- **Live examples.** Explore the playground, Safari-inspired browser controls, video transport, photo viewer, music player, and an interactive street map.

## Quick start

Install the exact experimental version with a bundler that supports ESM and CSS imports.

```sh
npm install @liquid-glass-forge/dom@0.1.0-rc.1 @liquid-glass-forge/webgl@0.1.0-rc.1
```

Give the artwork and the glass control explicit positions. In this example, the
canvas displays at its backing size and the toolbar starts at source coordinates
`(40, 80)`.

```html
<div style="position:relative;width:480px;height:240px">
  <canvas id="artwork" width="480" height="240"></canvas>
  <div id="toolbar" style="position:absolute;left:40px;top:80px;width:240px;
       height:64px;border-radius:32px;display:grid;place-items:center">
    <button type="button">Continue</button>
  </div>
</div>
```

```js
import { SourceProvider, createGlassScene } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import '@liquid-glass-forge/dom/styles.css';

const artwork = document.querySelector('#artwork');
const context = artwork.getContext('2d');
const color = context.createLinearGradient(0, 0, 480, 240);
color.addColorStop(0, '#91caff');
color.addColorStop(1, '#293c84');
context.fillStyle = color;
context.fillRect(0, 0, 480, 240);
context.fillStyle = '#14243f';
context.font = 'bold 64px system-ui';
context.fillText('Liquid glass', 24, 134);

const source = new SourceProvider({ kind: 'canvas', value: artwork });
const renderer = createOpticalRenderer({
  backend: 'auto',
  fallback: 'material',
  surface: { radius: 32, bevel: 14, strength: 24 },
  sourceRect: { x: 40, y: 80, width: 240, height: 64 },
});
const scene = createGlassScene({ source, renderer });
scene.attach(document.querySelector('#toolbar'));
await scene.ready;

// Call source.invalidate() after repainting the canvas.
// On unmount, release the scene and its caller-owned inputs.
function dispose() {
  scene.dispose();
  renderer.dispose();
  source.destroy();
}
```

Use [source mapping](docs/SOURCES.md) for responsive layouts, crop and fit rules,
and display scaling. Readable canvas or media sources must be origin-clean.
The renderer samples that explicit source. The CSS material can use the browser’s
live backdrop without a pixel provider.

## Packages

All packages share version **`0.1.0-rc.1`**.

| Package | Purpose |
| --- | --- |
| [`@liquid-glass-forge/core`](packages/core) | Source, geometry, scene, and renderer contracts |
| [`@liquid-glass-forge/cpu`](packages/cpu) | JavaScript optics and optional worker execution |
| [`@liquid-glass-forge/dom`](packages/dom) | Vanilla host, readable sources, coordinate mapping, and CSS materials |
| [`@liquid-glass-forge/webgl`](packages/webgl) | WebGL2 atlas and DOM renderer |
| [`@liquid-glass-forge/react`](packages/react) | React scene provider, surface, and hook |
| [`@liquid-glass-forge/vue`](packages/vue) | Vue scene provider, surface, and composable |
| [`@liquid-glass-forge/angular`](packages/angular) | Angular standalone components and scene directives |

## Release status and support

The npm packages are **experimental**. Pin the exact version and test it with your
sources, layouts, and target devices. The public showcase uses the current
repository build, including optics work ahead of the npm package. API stability,
sustained performance, and broad device qualification remain open. The iPad
example is a Simulator-based study, and physical iPad qualification is pending.
See the [preview notes](docs/PREVIEW.md) and [qualification record](docs/SUPPORT.json).

## Documentation

| Guide | Covers |
| --- | --- |
| [Source API](docs/SOURCES.md) | Readable inputs, ownership, coordinate mapping, and invalidation |
| [Host API](docs/HOSTS.md) | Scene lifecycle, fallback materials, and renderer integration |
| [Core contracts](docs/CONTRACTS.md) | Data formats, limits, and optical reference behavior |
| [Showcase](showcase/README.md) | Local site, demos, and calibration workflow |
| [Architecture](docs/ARCHITECTURE.md) | Package boundaries and design decisions |
| [Changelog](CHANGELOG.md) | Version history |
| [Contributing](CONTRIBUTING.md) | Reproductions, changes, and verification |

## Contributing

Open an [issue](https://github.com/namipsg/liquid-glass-forge/issues) for a bug
or proposal. Include a minimal reproduction, the source type and renderer, and
your browser and operating system. See [CONTRIBUTING.md](CONTRIBUTING.md) for
verification and review expectations.

## Development

Use Node.js 24 and pnpm 10.34.5 for the full workspace.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test
```

To run the showcase locally after the build:

```sh
pnpm showcase:build --working-tree
pnpm showcase:serve
```

Open [localhost:4173](http://localhost:4173/). The
[Pages workflow](.github/workflows/pages.yml) builds and deploys the static site
from `main`.

## License and credits

[MIT](LICENSE) · Created by **Nami Poursafargholi** (Zenixev).
Liquid Glass Forge is an independent project inspired by Apple’s Liquid Glass.
See [attribution](docs/ATTRIBUTION.md) for design references and credits.
