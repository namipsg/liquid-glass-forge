# Future development

**Status: roadmap placeholders.** These capabilities are not implemented or supported by an installable package today. Their dates, dependencies and supported platforms will be decided after feasibility work.

## Planned layers

| Area | Direction | Proposed distribution |
|---|---|---|
| Portable motion | Central tokens, spring/transition semantics, interruption and shared fixtures | @liquid-glass-forge/motion |
| React/SVG motion | Sileo-inspired expansion and joined-surface animation | @liquid-glass-forge/motion-react |
| Other web motion | Vanilla, Vue and Angular bindings to shared motion contracts | DOM motion adapter, motion-vue and motion-angular packages |
| Component systems | Independently authored Apple-inspired controls | components-dom, components-react, components-vue and components-angular packages |
| React Native | Native source, drawing and motion adapters, qualified on iOS/Android | @liquid-glass-forge/react-native |
| Flutter | Dart implementation and platform-qualified widgets/materials | liquid_glass_forge on pub.dev |

Names denote proposed boundaries, not reserved names or available packages. Unqualified names in the table use the @liquid-glass-forge scope.

## Motion reference and integration

[Sileo](https://github.com/hiaaryan/sileo) is the animation reference: its React component uses Motion-driven SVG rectangles and filters to create joined shapes. It informs the visual/state-transition direction, not source capture or optical rendering. [Reviewed component](https://github.com/hiaaryan/sileo/blob/b70fd826537dcdf0329e55f1e9ab208a66b61c79/packages/sileo/src/sileo.tsx)

Start with an optional React/SVG prototype while keeping tokens, time conventions and state contracts framework-neutral. A visual shape join does not establish matching refraction. Refractive morphing needs shared geometry/masks and CPU/WebGL conformance.

One driver owns each animated value. The renderer consumes a revisioned frame snapshot, coalesces invalidation and stops when idle/hidden. Centralize presets, support interruption/cancellation, preserve hydration, and disable transform/shape motion under reduced-motion policy. Qualify intermediate frames and the total animated source/mask/optics/presentation cost.

## Future workstreams

| Workstream | Initial investigation | Gate before a supported release |
|---|---|---|
| Portable motion | Token/clock/spring model, numerical trajectories and frame handoff | Deterministic interruption/settling behavior and no mandatory React dependency |
| React/SVG prototype | Content-sized expansion, filter bounds and shared silhouette experiments | Preference/SSR/lifecycle tests; distinct visual-only versus optical capability claims |
| Other web bindings | Vanilla, Vue and Angular lifecycle and motion ownership | Independent adapter fixtures, no React dependency and matching declared semantics |
| Component pilots | Notification/toast, glass button and segmented selection control | Correct keyboard/touch/focus/announcement behavior with motion disabled and opaque fallback |
| React Native | Native material APIs versus explicit-source drawing, source access and lifecycle | Clean consumer builds, actual iOS/Android evidence and explicit platform capability tiers |
| Flutter | Portable specification/fixtures in Dart, drawing strategy and animation lifecycle | Widget/numerical checks, clean package consumer and physical-device qualification |

Component pilots can later lead to toolbars, tab bars, sidebars, search surfaces, menus, popovers, dialogs/sheets, switches, sliders and feedback elements. Each component needs its own semantic and accessibility contract. These are independent counterparts inspired by public Apple guidance, not Apple-authored web components or an Apple-endorsed SDK.

React Native and Flutter can investigate independently after portable contracts stabilize. They must prove their own source access and drawing behavior. Reuse tokens, specifications and fixtures where practical; do not assume DOM/SVG/Canvas/WebGL implementations transfer unchanged. [React Native animations](https://reactnative.dev/docs/animations), [Flutter animation overview](https://docs.flutter.dev/ui/animations/overview)

## Activation and support policy

Each workstream needs a scoped proposal, owner, dependency decision, hardware/fixture plan and completion criteria before implementation. Prototype success is not a platform-support claim. Motion/components/native packages will have their own artifact and device smoke checks; web test results do not qualify native behavior.

See [architecture](ARCHITECTURE.md), [quality requirements](QUALITY.md) and [attribution](ATTRIBUTION.md).
