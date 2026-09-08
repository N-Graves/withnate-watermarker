/*! withnate-watermarker v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-watermarker#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/intake.js
  var DEFAULT_DRAGGING_CLASS = "is-dragging";
  var humanBytes = (n) => n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}MB` : `${Math.round(n / 1024)}KB`;
  var attachIntake = (root, opts) => {
    const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
    const input = root.querySelector('input[type="file"]');
    const accept = (file) => {
      if (!file)
        return;
      if (opts.maxBytes && file.size > opts.maxBytes) {
        opts.onReject?.(`That file is ${humanBytes(file.size)}. The limit here is ${humanBytes(opts.maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        opts.onReject?.("That file is empty.");
        return;
      }
      opts.onFile(file);
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      root.classList.add(draggingClass);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget))
        return;
      root.classList.remove(draggingClass);
    };
    const onDrop = (e) => {
      e.preventDefault();
      root.classList.remove(draggingClass);
      accept(e.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      accept(input?.files?.[0]);
      if (input)
        input.value = "";
    };
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        accept(file);
      }
    };
    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    input?.addEventListener("change", onChange);
    document.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("drop", onDrop);
      input?.removeEventListener("change", onChange);
      document.removeEventListener("paste", onPaste);
      root.classList.remove(draggingClass);
    };
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => {
    const w = globalThis;
    return w.WN ?? null;
  };
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // src/plan.ts
  var TILE_WIDTH_FRACTION = 0.2;
  var SPACING = 1.35;
  var ROW_STAGGER = 0.5;
  var ANGLE_DEGREES = 30;
  var MIN_TILE_WIDTH_PX = 96;
  var rotatedBounds = (width, height, degrees) => {
    const r = degrees * Math.PI / 180;
    const c = Math.abs(Math.cos(r));
    const s = Math.abs(Math.sin(r));
    return {
      width: width * c + height * s,
      height: width * s + height * c
    };
  };
  var planTiles = (image, markAspect, opts = {}) => {
    const angle = opts.angle ?? ANGLE_DEGREES;
    const markWidth = Math.max(
      1,
      Math.round(Math.min(image.width, image.height) * (opts.widthFraction ?? TILE_WIDTH_FRACTION))
    );
    const markHeight = Math.max(1, Math.round(markWidth / markAspect));
    const bounds = rotatedBounds(markWidth, markHeight, angle);
    const spacing = Math.max(1, opts.spacing ?? SPACING);
    const stagger = opts.stagger ?? ROW_STAGGER;
    const pitchX = Math.max(1, Math.round(bounds.width * spacing));
    const pitchY = Math.max(1, Math.round(bounds.height * spacing));
    const placements = [];
    for (let row = -1; row * pitchY - bounds.height / 2 < image.height; row += 1) {
      const y = row * pitchY - bounds.height / 2;
      for (let col = -1; col * pitchX - bounds.width / 2 < image.width; col += 1) {
        const x = col * pitchX + (row % 2 !== 0 ? pitchX * stagger : 0) - bounds.width / 2;
        placements.push({ x, y, row, col });
      }
    }
    return {
      markWidth,
      markHeight,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      pitchX,
      pitchY,
      angle,
      placements
    };
  };
  var CENTRAL_WIDTH_FRACTION = 0.62;
  var CENTRAL_MAX_HEIGHT_FRACTION = 0.45;
  var MIN_CENTRAL_WIDTH_PX = 48;
  var planCentral = (image, markAspect, opts = {}) => {
    let markWidth = Math.max(
      1,
      Math.round(image.width * (opts.widthFraction ?? CENTRAL_WIDTH_FRACTION))
    );
    let markHeight = Math.max(1, Math.round(markWidth / markAspect));
    const maxHeight = Math.round(image.height * CENTRAL_MAX_HEIGHT_FRACTION);
    if (markHeight > maxHeight) {
      markHeight = Math.max(1, maxHeight);
      markWidth = Math.max(1, Math.round(markHeight * markAspect));
    }
    return {
      x: (image.width - markWidth) / 2,
      y: (image.height - markHeight) / 2,
      markWidth,
      markHeight,
      angle: opts.angle ?? 0
    };
  };
  var LUMA_THRESHOLD = 128;
  var LUMA_HYSTERESIS = 24;
  var pickInk = (patchLuma, imageLuma, threshold = LUMA_THRESHOLD, hysteresis = LUMA_HYSTERESIS) => {
    if (patchLuma >= threshold + hysteresis) return "dark";
    if (patchLuma <= threshold - hysteresis) return "light";
    return imageLuma >= threshold ? "dark" : "light";
  };
  var lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  var patchMeanLuma = (rgba, imageWidth, imageHeight, rect, fallback = LUMA_THRESHOLD) => {
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(imageWidth, Math.ceil(rect.x + rect.width));
    const y1 = Math.min(imageHeight, Math.ceil(rect.y + rect.height));
    if (x1 <= x0 || y1 <= y0) return fallback;
    let acc = 0;
    let n = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const p = (y * imageWidth + x) * 4;
        if (rgba[p + 3] === 0) continue;
        acc += lumaOf(rgba[p], rgba[p + 1], rgba[p + 2]);
        n += 1;
      }
    }
    return n === 0 ? fallback : acc / n;
  };
  var meanLuma = (rgba) => {
    let acc = 0;
    let n = 0;
    for (let p = 0; p < rgba.length; p += 4) {
      if (rgba[p + 3] === 0) continue;
      acc += lumaOf(rgba[p], rgba[p + 1], rgba[p + 2]);
      n += 1;
    }
    return n === 0 ? 0 : acc / n;
  };

  // src/compose.ts
  var TILED_OPACITY = 0.15;
  var CENTRAL_OPACITY = 0.28;
  var canvas2d = (w, h, opts) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext("2d", opts);
    if (!ctx) throw new Error("this browser would not give us a 2d canvas");
    return ctx;
  };
  var FONTS = [
    { id: "sans", label: "Bold sans", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { id: "serif", label: "Bold serif", stack: 'Georgia, "Times New Roman", serif' },
    { id: "mono", label: "Bold mono", stack: '"SF Mono", Consolas, "Courier New", monospace' }
  ];
  var markFromText = (text, fontStack) => {
    const SIZE = 256;
    const measure = canvas2d(8, 8);
    measure.font = `bold ${SIZE}px ${fontStack}`;
    const m = measure.measureText(text);
    const ascent = m.actualBoundingBoxAscent || SIZE * 0.8;
    const descent = m.actualBoundingBoxDescent || SIZE * 0.2;
    const w = Math.max(1, Math.ceil(m.width));
    const h = Math.max(1, Math.ceil(ascent + descent));
    const ctx = canvas2d(w, h);
    ctx.font = `bold ${SIZE}px ${fontStack}`;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, 0, ascent);
    return ctx.canvas;
  };
  var trimToInk = (source, size) => {
    const ctx = canvas2d(size.width, size.height, { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    let minX = size.width;
    let minY = size.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        if (data[(y * size.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return ctx.canvas;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w === size.width && h === size.height) return ctx.canvas;
    const out = canvas2d(w, h);
    out.drawImage(ctx.canvas, minX, minY, w, h, 0, 0, w, h);
    return out.canvas;
  };
  var tintMark = (mark, colour) => {
    const ctx = canvas2d(mark.width, mark.height);
    ctx.drawImage(mark, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, mark.width, mark.height);
    return ctx.canvas;
  };
  var LIGHT = "#ffffff";
  var DARK = "#111111";
  var compose = (source, size, mark, opts) => {
    const sampler = canvas2d(size.width, size.height, { willReadFrequently: true });
    sampler.drawImage(source, 0, 0, size.width, size.height);
    const clean = sampler.getImageData(0, 0, size.width, size.height).data;
    const imageLuma = meanLuma(clean);
    const out = canvas2d(size.width, size.height);
    out.drawImage(source, 0, 0, size.width, size.height);
    out.globalAlpha = opts.opacity ?? (opts.style === "tiled" ? TILED_OPACITY : CENTRAL_OPACITY);
    const light = tintMark(mark, LIGHT);
    const dark = tintMark(mark, DARK);
    const aspect = mark.width / mark.height;
    const inkCounts = { light: 0, dark: 0 };
    let marksDrawn = 0;
    const place = (x, y, w, h, angle) => {
      const bounds = rotatedBounds(w, h, angle);
      const patch = patchMeanLuma(clean, size.width, size.height, {
        x,
        y,
        width: bounds.width,
        height: bounds.height
      });
      const ink = pickInk(patch, imageLuma);
      inkCounts[ink] += 1;
      out.save();
      out.translate(x + bounds.width / 2, y + bounds.height / 2);
      out.rotate(angle * Math.PI / 180);
      out.drawImage(ink === "light" ? light : dark, -w / 2, -h / 2, w, h);
      out.restore();
      marksDrawn += 1;
    };
    if (opts.style === "tiled") {
      const plan = planTiles(size, aspect, {
        widthFraction: opts.widthFraction,
        angle: opts.angle
      });
      for (const p of plan.placements) {
        place(p.x, p.y, plan.markWidth, plan.markHeight, plan.angle);
      }
    } else {
      const plan = planCentral(size, aspect, {
        widthFraction: opts.widthFraction,
        angle: opts.angle
      });
      place(plan.x, plan.y, plan.markWidth, plan.markHeight, plan.angle);
    }
    return { canvas: out.canvas, marksDrawn, inkCounts };
  };
  var toPngBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("could not encode the image")), "image/png");
  });

  // src/index.ts
  var el = (root, sel) => root.querySelector(sel);
  mount("[data-wm]", ({ root }) => {
    const intake = el(root, "[data-wm-intake]");
    const preview = el(root, "[data-wm-preview]");
    const errorOut = el(root, "[data-wm-error]");
    const controls = el(root, "[data-wm-controls]");
    if (!intake || !preview) return;
    const state = {
      artwork: null,
      markImage: null,
      text: "\xA9 Your Name",
      font: FONTS[0].stack,
      style: "tiled",
      opacity: null
    };
    let objectUrl = null;
    const clearOutput = () => {
      preview.replaceChildren();
      const count = el(root, "[data-wm-count]");
      if (count) count.textContent = "";
      const link = el(root, "[data-wm-download]");
      if (link) link.hidden = true;
    };
    const showError = (m) => {
      if (errorOut) errorOut.textContent = m;
    };
    const clearError = () => {
      if (errorOut) errorOut.textContent = "";
    };
    const buildMark = () => {
      if (state.markImage) {
        return trimToInk(state.markImage, {
          width: state.markImage.width,
          height: state.markImage.height
        });
      }
      const text = state.text.trim();
      if (!text) return null;
      return markFromText(text, state.font);
    };
    const draw = () => {
      if (!state.artwork) return;
      const mark = buildMark();
      if (!mark) {
        showError("Type some text for the watermark, or upload a logo to use instead.");
        clearOutput();
        return;
      }
      const size = { width: state.artwork.bitmap.width, height: state.artwork.bitmap.height };
      const projected = state.style === "tiled" ? Math.round(Math.min(size.width, size.height) * TILE_WIDTH_FRACTION) : Math.round(size.width * 0.62);
      const floor = state.style === "tiled" ? MIN_TILE_WIDTH_PX : MIN_CENTRAL_WIDTH_PX;
      if (projected < floor) {
        showError(
          `This image is too small to mark legibly \u2014 the watermark would come out ${projected} pixels across. Use a larger version of the artwork.`
        );
        clearOutput();
        return;
      }
      clearError();
      const opts = { style: state.style };
      if (state.opacity !== null) opts.opacity = state.opacity;
      const result = compose(state.artwork.bitmap, size, mark, opts);
      const img = document.createElement("img");
      img.alt = "Your artwork with the watermark applied";
      img.className = "wm-preview-img";
      void toPngBlob(result.canvas).then((blob) => {
        const url = URL.createObjectURL(blob);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = url;
        img.src = url;
        const link = el(root, "[data-wm-download]");
        if (link) {
          link.href = url;
          const base = state.artwork?.name.replace(/\.[^.]+$/, "") ?? "artwork";
          link.download = `${base}-watermarked.png`;
          link.hidden = false;
        }
      });
      const count = el(root, "[data-wm-count]");
      if (count) {
        count.textContent = result.marksDrawn === 1 ? "One mark, coloured to suit what it sits on." : `${result.marksDrawn} marks \u2014 ${result.inkCounts.light} light, ${result.inkCounts.dark} dark, each chosen from what it covers.`;
      }
      preview.replaceChildren(img);
    };
    attachIntake(intake, {
      onReject: showError,
      onFile: (file) => {
        clearError();
        void createImageBitmap(file).then((bitmap) => {
          state.artwork?.bitmap.close();
          state.artwork = { bitmap, name: file.name };
          if (controls) controls.hidden = false;
          draw();
        }).catch(
          () => showError(
            "That file could not be opened as an image. PNG, JPEG, GIF and WebP all work; a HEIC from an iPhone needs exporting as JPEG first."
          )
        );
      }
    });
    const textInput = el(root, "[data-wm-text]");
    if (textInput) {
      textInput.value = state.text;
      textInput.addEventListener("input", () => {
        state.text = textInput.value;
        state.markImage = null;
        draw();
      });
    }
    const fontSelect = el(root, "[data-wm-font]");
    if (fontSelect) {
      fontSelect.replaceChildren(
        ...FONTS.map((f) => {
          const o = document.createElement("option");
          o.value = f.stack;
          o.textContent = f.label;
          return o;
        })
      );
      fontSelect.addEventListener("change", () => {
        state.font = fontSelect.value;
        draw();
      });
    }
    const markInput = el(root, "[data-wm-mark]");
    markInput?.addEventListener("change", () => {
      const file = markInput.files?.[0];
      if (!file) return;
      void createImageBitmap(file).then((bitmap) => {
        state.markImage?.close();
        state.markImage = bitmap;
        draw();
      }).catch(() => showError("That logo could not be opened. A PNG with transparency works best."));
    });
    for (const b of Array.from(root.querySelectorAll("[data-wm-style]"))) {
      b.addEventListener("click", () => {
        const next = b.dataset["wmStyle"];
        if (next !== "tiled" && next !== "central") return;
        state.style = next;
        for (const other of Array.from(root.querySelectorAll("[data-wm-style]"))) {
          other.setAttribute("aria-pressed", String(other.dataset["wmStyle"] === next));
        }
        draw();
      });
    }
    const opacityInput = el(root, "[data-wm-opacity]");
    opacityInput?.addEventListener("input", () => {
      const v = Number(opacityInput.value);
      state.opacity = Number.isFinite(v) ? v / 100 : null;
      draw();
    });
  });
})();
