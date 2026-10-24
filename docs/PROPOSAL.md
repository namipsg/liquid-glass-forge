# Project proposal

**Status: proposed design, 24 October 2026.** Features and performance remain unvalidated until implementation and qualification.

## Goal

Build Liquid Glass Forge as a reusable rendering foundation with explicit source requirements, genuine JavaScript CPU optics, a WebGL implementation, predictable fallback and consistent framework lifecycle behavior. Optional motion and component packages can build on the foundation later.

The initial scope covers vanilla JavaScript, React, Vue and Angular. React Native and Flutter are future feasibility work; web support will not imply native support.

## Two rendering modes

| Mode | Source | Intended result |
|---|---|---|
| Live DOM material | Content behind an element, processed by browser CSS | Blur, tint, rim/highlight styling and an opaque fallback |
| Optical refraction | Application-supplied readable image, video, canvas, bitmap or pixel provider | CPU or WebGL refraction, blur, dispersion and highlights |

Source acquisition and rendering are separate contracts. Standard canvas pixel reads expose the canvas bitmap, not unrestricted page-compositor output; arbitrary HTML is not an ordinary drawImage source. A DOM reconstruction adapter, if added, will have an explicit supported-content contract. [WHATWG Canvas image sources](https://html.spec.whatwg.org/multipage/canvas.html#image-sources-for-2d-rendering-contexts)

Origin/CORS restrictions remain applicable. A tainted or unavailable source produces a typed failure or permitted fallback. Changing to CPU does not bypass source security. [Cross-origin canvas rules](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)

## Foundation scope

- Rounded rectangles and circles, with documented axis-aligned coordinate transforms.
- Explicit sources, revisions, clipping and resource ownership.
- A bounded asynchronous lifecycle with cancellation, status reporting and disposal.
- Separate CPU and WebGL2 implementations of a versioned optical model.
- Native DOM text and controls above decorative rendering.
- SSR-safe imports, stable hydration and framework-owned markup.
- Opaque/reduced-motion behavior and an evidence-based browser support policy.

The visual model will be an independently authored approximation. It does not claim equivalence to Apple's proprietary implementation.

## Future direction

Motion will begin with a Sileo-inspired React/SVG experiment while retaining portable tokens and state contracts. Apple-inspired component pilots will follow the qualified material and motion layers. Native packages require their own source/drawing adapters and device evidence. See [future development](FUTURE.md).

## Completion criteria

A supported release requires implemented behavior, passing numerical/browser/package checks, recorded physical-device results, documented workload limits and verified npm artifacts. Attractive examples or test counts alone do not establish those guarantees.

See [architecture](ARCHITECTURE.md), [quality requirements](QUALITY.md) and the [foundation roadmap](ROADMAP.md).
