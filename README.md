# withnate-watermarker

Put a watermark on your artwork before you post it — text or a logo, either one large mark or tiled
so a crop cannot remove it.

**Runs entirely in the browser. Your artwork never leaves your device**, which for a tool whose whole
purpose is protecting unpublished work is the only architecture that makes sense.

MIT licensed.

## The two things that make it different

Most free watermarkers stamp a fixed-colour mark on the image and leave you to notice when it has
vanished.

### The ink is chosen per mark, with a deadband

A white mark disappears on a pale sky and a black one disappears on a dark coat, so each mark is
drawn light or dark depending on what it lands on.

Doing that **per tile alone makes the mark checkerboard.** On a real framed-bedroom mockup from this
business, neighbouring tiles measured **122 and 132 against a threshold of 128** and flipped black to
white between them, which reads as a rendering fault rather than as a watermark. So there is a
hysteresis band of ±24: inside it the whole-image average wins, outside it the tile decides.

> One ink for the whole image is coherent and loses every mark crossing a bright subject on a dark
> ground — which is most of this product line, and exactly the region worth stealing. Per-tile alone
> flickers. The deadband gets both.

Verified by measuring, not by looking: on a half-dark, half-bright test image, the dark half came
back with **4,107 pixels lightened and zero darkened**, the bright half with **4,125 darkened and
zero lightened**.

### The geometry is sized off the short edge, and the spacing is measured

Deriving the tile from `min(width, height)` makes it aspect-invariant, so a square print and a
3360 × 840 banner get a mark of the same visual weight rather than one of them getting a stripe. It
also keeps the mark *count* roughly constant with resolution — a 4096px export carries the same
fourteen-odd marks as the 1024px master rather than sixteen times as many.

The 1.35 spacing is not a guess. Measured as worst case over every sliding crop position, as the
fraction of one whole mark's ink retained:

| Spacing | Retained by a crop of a third of the short side |
|---|---|
| 1.6 | 0.36 |
| **1.35** | **0.95** |
| 1.2 | 1.00, but the picture is visibly veiled |

The lattice deliberately overruns every edge, because a clean unmarked margin is the first thing
anybody crops to.

## Honest about what a watermark is worth

Stated here because tools in this category usually imply more than they deliver:

- **A low-opacity overlay deters casual right-click-and-repost and does not stop anyone determined.**
  Modern inpainting removes it.
- **Below roughly 10 delta-luma a mark does not survive a screenshot or a re-encode**, which makes it
  decoration rather than protection. The default lands around 33 on a mid-tone, so turning the
  strength slider down has a real cost, and the interface says so.

## Two traps, one avoided and one that did not apply

- ⚠️ **Sampling must read the clean source, never the canvas being drawn on.** Ink already laid down
  shifts the brightness under the next mark — measured at 140.0 against 136.7 in the pipeline this is
  ported from — so measuring the working canvas makes each mark's colour depend on the ones before it
  and the lattice drifts. There are two canvases here for that reason.
- The Python original has to work around `paste(tile, box, tile)` **squaring the alpha** on an RGBA
  destination, which silently lands a 0.15 mark at 0.022. **Canvas does not do this** — `globalAlpha`
  multiplies once — so the opacity here is the opacity you get. Recorded so nobody reintroduces the
  workaround.

## Output

Always PNG, whatever came in. A JPEG in and a JPEG out means a second generation of compression
across the whole picture in order to add a watermark — a real quality cost paid for nothing. This
file exists to be posted, not archived.

Fonts are **system stacks, never a webfont.** The site refuses third-party requests of any kind, and
a watermark tool that phoned out for a typeface would break that for the one page where it matters
most.

## Refusals

It refuses rather than producing something illegible: below a **96px** tiled mark or a **48px**
central one, you get a message naming the size it would have been. A smudge is not a deterrent, it is
a defect the customer asks about.

## Integration

Plain IIFE, does nothing unless the page contains `data-wm`. Copy `dist/watermarker.js` and
`dist/watermarker.css` into the site's assets. The markup is not built by the script.
`demo/index.html` is the working contract.

| Attribute | Required | What it is |
|---|---|---|
| `data-wm` | yes | The root. Absent, the script does nothing. |
| `data-wm-intake` | yes | Drop target, containing an `<input type="file">` which is found, not created. |
| `data-wm-preview` | yes | Where the marked image is shown. |
| `data-wm-controls` | no | Revealed once artwork is loaded. Give it `hidden`. |
| `data-wm-text` / `data-wm-font` / `data-wm-mark` | no | Mark text, font select, logo upload. |
| `data-wm-style` | no | Buttons carrying `tiled` or `central`, kept in sync via `aria-pressed`. |
| `data-wm-opacity` | no | Range input, 5–60, read as a percentage. |
| `data-wm-download` | no | Anchor. Given an `href` and `download` when a result exists. |
| `data-wm-error` / `data-wm-count` | no | Refusals and the mark tally. |

The stylesheet defines only `.wm-` classes, enforced by a smoke check.

## Structured data

`demo/index.html` carries a static JSON-LD `WebApplication` block. Verified against the site's own
tooling rather than assumed: `scripts/check.mjs` fails a page with a second inline `<script>` but
**explicitly exempts `type="application/ld+json"`**, and `scripts/seo.mjs` fails the build on a block
that does not parse or carries no `@type`. No rating, no review count.

## Security posture

Nothing is uploaded, stored or transmitted, which for a tool whose entire purpose is protecting
unpublished work is the only architecture that makes sense. What is left is memory.

**This is the most allocation-hungry of these tools, and it now says no.** A single draw holds the
sampler canvas, a copy of its pixels and the output canvas, then encodes a PNG of the whole thing —
roughly four times width × height × 4 bytes of working set. At 50 megapixels that is already 800MB,
and the opacity slider redraws on every input event. So:

| Input | Ceiling | Why |
|---|---|---|
| Artwork | 50 megapixels | An A3 print master at 300dpi is 17; a 4× upscale off this project's own pipeline is 21. Far above anything this is for. |
| Uploaded logo | 16 megapixels | A mark is small by nature, and it is additionally read back pixel by pixel to trim it to its ink. |
| Watermark text | 64 characters | At 256px bold, unbounded text is an unbounded canvas width. Also set as the input's own `maxLength`, so the two numbers cannot disagree. |

Each refusal says what was measured and what to do instead. The text ceiling is applied in
`buildMark` as well as on the element, because the page's markup belongs to the site rather than to
this script.

On the DOM side: everything is `createElement` and `textContent`, and **no string from the file or
the visitor reaches the page at all** — the watermark text goes to `fillText` on a canvas, never into
markup, and the filename is only ever used for the download's suggested name.

There are no bundled marks and no preset list. The mark is always the visitor's own text or their own
upload, so nobody's brand can be applied to somebody else's work through this.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 35 tests
npm run smoke   # 20 checks against the built bundle
npm run demo    # serves demo/ on :4175
```

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core), for file intake
and mounting.

The canvas code is **not** shared with the pet photo checker, despite both needing pixels. The
overlap turned out to be a six-line helper whose options genuinely differ — that one wants
`willReadFrequently` for repeated reads, this one must not, because the hint pessimises GPU-backed
drawing — and this tool must never downscale, since it outputs the image rather than measuring it.
Extracting on that would have been extracting the wrong abstraction.

## Licence

MIT.
