# Attribution and source references

Liquid Glass Forge is an independent project inspired by Apple's Liquid Glass design. It is not affiliated with, sponsored by or endorsed by Apple Inc. Apple is a trademark of Apple Inc., registered in the U.S. and other countries and regions. References to Liquid Glass identify Apple's design.

The project's independently authored materials are covered by the [MIT License](../LICENSE), whose copyright holder is Nami Poursafargholi. Design inspiration does not assign Apple copyright over this implementation or grant permission to copy Apple-owned materials.

The showcase player and its poster use *Sprite Fright* by Blender Studio, © Blender Foundation. Forge re-encoded the film for web playback and extracted the poster from it. [Project license and credits](https://studio.blender.org/projects/sprite-fright/pages/about/) · [Media manifest](../showcase/public/media/sprite-fright.json).

## Design and implementation references

- [Apple's Liquid Glass introduction](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/) and [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) inform the material/component direction.
- [ybouane/liquidglass](https://github.com/ybouane/liquidglass), reviewed at commit 59af227103795f06421a96e2c7d3dceb081decd2, informed the web rendering exploration.
- [hiaaryan/sileo](https://github.com/hiaaryan/sileo), reviewed at commit b70fd826537dcdf0329e55f1e9ab208a66b61c79, informs the proposed React/SVG animation direction.

These are references, not current runtime dependencies. The phase 1 spike and phase 2 core are independently authored; no upstream library source, Apple assets or Sileo code is included. Any future reuse must be reviewed for its applicable license and carry required notices in the actual distributed artifacts.

The npm organization `@liquid-glass-forge` was created on 3 November 2026 under
`namipsg`. Registry ownership does not establish trademark clearance, a trademark
license or endorsement. Package publication remains held; see [the release procedure](RELEASING.md).
