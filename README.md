# Liquid Glass Forge

A rendering engine for refractive glass on the web. Use a readable image, canvas,
video, or pixel source to bend the content behind ordinary HTML controls.
Integrate it with vanilla JavaScript, React, Vue, or Angular.

[Live playground](https://namipsg.github.io/liquid-glass-forge/#playground) ·
[Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) ·
[Framework and device support](https://namipsg.github.io/liquid-glass-forge/support.html) ·
[Performance](#performance) ·
[Install by framework](#quick-start)

[![npm preview](https://img.shields.io/npm/v/%40liquid-glass-forge%2Fdom/next?label=npm%20preview)](https://www.npmjs.com/package/@liquid-glass-forge/dom/v/0.1.0-rc.1)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://github.com/namipsg/liquid-glass-forge/actions/workflows/pages.yml/badge.svg)](https://github.com/namipsg/liquid-glass-forge/actions/workflows/pages.yml)

## Quick start

Choose your framework. These commands install the published experimental
preview and the packages needed by the corresponding starter.

| Framework | Install in your app |
| --- | --- |
| <img src="showcase/public/frameworks/react.svg" width="18" height="18" alt=""> [React](docs/QUICKSTART.md#react) | `npm install @liquid-glass-forge/react@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1` |
| <img src="showcase/public/frameworks/vue.svg" width="18" height="18" alt=""> [Vue](docs/QUICKSTART.md#vue) | `npm install @liquid-glass-forge/vue@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1` |
| <img src="showcase/public/frameworks/angular.svg" width="18" height="18" alt=""> [Angular](docs/QUICKSTART.md#angular) | `npm install @liquid-glass-forge/angular@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1` |
| <img src="showcase/public/frameworks/vanilla.svg" width="18" height="18" alt=""> [Vanilla JS](docs/QUICKSTART.md#vanilla) | `npm install @liquid-glass-forge/dom@0.1.0-rc.1` |

[![A glass lens moving across text and bending the lettering underneath](docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/#playground)

### React example

Use this as `App.jsx` in an existing React app. The preview expects React and
React DOM **19.3.1**. For Next.js App Router, keep `'use client'` on the component
and put the global CSS import in `app/layout.jsx` if your app manages it there.

```jsx
'use client';

import { GlassSurface } from '@liquid-glass-forge/react';
import '@liquid-glass-forge/dom/styles.css';

export default function App() {
  return (
    <main style={{ padding: 48, background: 'linear-gradient(130deg, #bde7ff, #8495ea)' }}>
      <GlassSurface style={{ display: 'inline-block', padding: 16, borderRadius: 24 }}>
        <button type="button">Continue</button>
      </GlassSurface>
    </main>
  );
}
```

This uses the CSS glass material. To bend pixels from an image or canvas, follow
the [React refraction example](docs/QUICKSTART.md#react-with-webgl-refraction).
The [website installer](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers)
has copy buttons and the current published version.

## What it does

- **WebGL2 and CPU optics.** Refraction, blur, color dispersion, tint, and rim light over explicit pixel sources. CPU rendering supports an optional worker and bounded update rates.
- **Native controls.** The optical layer is decorative. Buttons, inputs, links, and text stay in the DOM with their normal keyboard and accessibility behavior.
- **Material fallbacks.** Use a CSS backdrop material or opaque surface when an optical source is unavailable or the interface calls for more contrast.
- **Live examples.** Explore the playground, Safari-inspired browser controls, video transport, photo viewer, music player, and an interactive street map.

## Performance

| Recorded workload | Result |
| --- | --- |
| Galaxy A04s, one 320×180 CPU worker surface | **34.3–34.8 ms** p95 completion interval. [Phase 5](docs/PHASE-5.md#current-full-physical-qualification-2026-10-31) |
| Galaxy A04s, four 640×360 WebGL2 outputs below the fold | **13.5–16.3 ms** p95 batch time. [Phase 6](docs/PHASE-6.md#recorded-results) |
| Apple M4 Mac, four adapters running a dynamic worker workload | **30 minutes**, more than 53,000 completed frames per adapter, and **34.9 ms** p95 completion interval. [Phase 11](docs/PHASE-11.md#physical-results-recorded-on-3-november-2026) |

Frame intervals and age help teams budget for jitter and stale pixels. Image
storage and cleanup checks help size multi-panel layouts and catch resource
retention across navigation. These are historical workload measurements.
SwiftShader and later A04s runs missed timing limits, and broad device
qualification remains open.

[Benchmark methods, limits, and reproduction commands](docs/PERFORMANCE.md) ·
[Performance on the showcase](https://namipsg.github.io/liquid-glass-forge/#performance)

## Packages

The published package set shares version **`0.1.0-rc.1`**.

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
