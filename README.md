# withnate-watermarker

Put a watermark on your artwork before you post it — text or an image, either a single large mark or
a tiled diagonal one.

**Runs entirely in the browser. Your artwork never leaves your device**, which for a tool whose whole
purpose is protecting unpublished work is the only architecture that makes sense.

MIT licensed. Status: **not built yet** — see the roadmap below.

## What makes this one different

Most free watermarkers put a fixed-colour mark on the image and leave you to notice it has vanished.
Two things here are carried over from a working implementation where every constant was chosen by
measurement rather than taste:

**The ink colour is chosen per tile, with a deadband.** A white mark disappears on a pale sky and a
black one disappears on a dark coat, so the mark is drawn light or dark depending on what it lands
on. Doing that per tile *alone* makes the mark checkerboard — on a real test image neighbouring tiles
measured 122 and 132 against a threshold of 128 and flipped black to white between them, which reads
as a rendering fault rather than a watermark. So there is a hysteresis band of 24 either side of the
threshold, and inside it the whole-image average wins. One ink where the image is ambiguous, per-tile
ink where it genuinely matters.

**The tile geometry is sized off the short edge, and the spacing is measured.** Deriving the tile
from `min(width, height)` makes it aspect-invariant, so a square print and a wide banner get the same
mark rather than one of them getting a stripe. The 1.35 spacing is not a guess: measured as worst
case over every sliding crop position, at 1.6 a crop of a third of the short side retains 0.36 of a
mark, at 1.35 it retains 0.95, and at 1.2 the picture is visibly veiled. The lattice deliberately
overruns the edges, because a clean unmarked margin is the first thing anyone crops to.

## Honest about what a watermark is worth

Stated here because tools in this category usually imply more than they deliver: **a low-opacity
overlay deters casual right-click-and-repost and does not stop anyone determined.** Modern inpainting
removes it. Below roughly 10 delta-luma a mark does not survive a screenshot or an Instagram
re-encode either, which makes it decorative rather than protective — so the default sits where it
does for a reason, and turning it down has a cost.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core).

## Licence

MIT.
