/*! withnate-watermarker v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-watermarker#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/bytes.js
  var u8 = (b, i) => {
    const v = b[i];
    if (v === void 0)
      throw new RangeError(`byte ${i} is past the end of the buffer`);
    return v;
  };
  var be16 = (b, i) => u8(b, i) << 8 | u8(b, i + 1);
  var le16 = (b, i) => u8(b, i) | u8(b, i + 1) << 8;
  var le24 = (b, i) => u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16;
  var be32 = (b, i) => (u8(b, i) << 24 | u8(b, i + 1) << 16 | u8(b, i + 2) << 8 | u8(b, i + 3)) >>> 0;
  var le32 = (b, i) => (u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16 | u8(b, i + 3) << 24) >>> 0;
  var matchBytes = (b, sig, offset = 0) => {
    if (b.length < offset + sig.length)
      return false;
    for (let i = 0; i < sig.length; i += 1) {
      if (b[offset + i] !== sig[i])
        return false;
    }
    return true;
  };
  var matchAscii = (b, offset, s) => {
    if (b.length < offset + s.length)
      return false;
    for (let i = 0; i < s.length; i += 1) {
      if (b[offset + i] !== s.charCodeAt(i))
        return false;
    }
    return true;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  var JPEG_SIG = [255, 216, 255];
  var GIF87_SIG = [71, 73, 70, 56, 55, 97];
  var GIF89_SIG = [71, 73, 70, 56, 57, 97];
  var RIFF_SIG = [82, 73, 70, 70];
  var WEBP_SIG = [87, 69, 66, 80];
  var HEADER_BYTES = 64 * 1024;
  var sniffFormat = (bytes) => {
    if (matchBytes(bytes, PNG_SIG))
      return "png";
    if (matchBytes(bytes, JPEG_SIG))
      return "jpeg";
    if (matchBytes(bytes, GIF87_SIG) || matchBytes(bytes, GIF89_SIG))
      return "gif";
    if (matchBytes(bytes, RIFF_SIG) && matchBytes(bytes, WEBP_SIG, 8))
      return "webp";
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;
  var MM_PER_METRE = 1e3;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  var MAX_ENTRIES = 4096;
  var MAX_COMPONENTS = 1024;
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var key = (ifd, tag) => `${ifd}:${tag}`;
  var findTiffBlock = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === "jpeg") {
      let p = 2;
      while (p + 4 <= bytes.length) {
        if (u8(bytes, p) !== 255) {
          p += 1;
          continue;
        }
        const marker = u8(bytes, p + 1);
        if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
          p += 2;
          continue;
        }
        const len = u8(bytes, p + 2) << 8 | u8(bytes, p + 3);
        if (len < 2)
          return null;
        if (marker === 225 && matchAscii(bytes, p + 4, "Exif\0\0")) {
          return bytes.subarray(p + 10, p + 2 + len);
        }
        if (marker === 218)
          return null;
        p = p + 2 + len;
      }
      return null;
    }
    if (format === "png") {
      let p = 8;
      while (p + 8 <= bytes.length) {
        const len = be32(bytes, p);
        if (matchAscii(bytes, p + 4, "eXIf"))
          return bytes.subarray(p + 8, p + 8 + len);
        if (matchAscii(bytes, p + 4, "IDAT") || matchAscii(bytes, p + 4, "IEND"))
          return null;
        p += 12 + len;
      }
      return null;
    }
    if (format === "webp") {
      let p = 12;
      while (p + 8 <= bytes.length) {
        const len = le32(bytes, p + 4);
        if (matchAscii(bytes, p, "EXIF")) {
          const start = matchAscii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
          return bytes.subarray(start, p + 8 + len);
        }
        p += 8 + len + len % 2;
      }
      return null;
    }
    return null;
  };
  var reader = (b, little) => ({
    u16: (i) => little ? u8(b, i) | u8(b, i + 1) << 8 : u8(b, i) << 8 | u8(b, i + 1),
    u32: (i) => little ? le32(b, i) : be32(b, i),
    i32: (i) => (little ? le32(b, i) : be32(b, i)) | 0,
    byte: (i) => u8(b, i)
  });
  var TEXT = new TextDecoder("utf-8", { fatal: false });
  var decodeAscii = (block, offset, count) => {
    let end = offset;
    const limit = offset + count;
    while (end < limit && block[end] !== 0)
      end += 1;
    return TEXT.decode(block.subarray(offset, end)).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  };
  var readValue = (r, block, type, count, offset) => {
    if (type === 2)
      return decodeAscii(block, offset, count);
    const size = TYPE_SIZE[type];
    const one = (i) => {
      const at = offset + i * size;
      switch (type) {
        case 1:
        case 7:
          return r.byte(at);
        case 3:
          return r.u16(at);
        case 4:
          return r.u32(at);
        case 9:
          return r.i32(at);
        case 5:
          return { numerator: r.u32(at), denominator: r.u32(at + 4) };
        case 10:
          return { numerator: r.i32(at), denominator: r.i32(at + 4) };
        default:
          return 0;
      }
    };
    if (count === 1)
      return one(0);
    const out = [];
    for (let i = 0; i < count; i += 1)
      out.push(one(i));
    return out;
  };
  var IFD_EXIF_POINTER = 34665;
  var IFD_GPS_POINTER = 34853;
  var readIfd = (r, block, start, ifd, entries, seen, depth) => {
    if (depth > 4 || seen.has(start) || start + 2 > block.length)
      return 0;
    seen.add(start);
    const count = r.u16(start);
    let p = start + 2;
    for (let i = 0; i < count; i += 1, p += 12) {
      if (p + 12 > block.length || entries.length >= MAX_ENTRIES)
        break;
      const tag = r.u16(p);
      const type = r.u16(p + 2);
      const n = r.u32(p + 4);
      const size = TYPE_SIZE[type] ?? 0;
      if (size === 0 || n === 0)
        continue;
      const bytesNeeded = size * n;
      const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
      if (valueAt + bytesNeeded > block.length)
        continue;
      if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
        const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
        readIfd(r, block, target, tag === IFD_EXIF_POINTER ? "exif" : "gps", entries, seen, depth + 1);
        continue;
      }
      if (type !== 2 && n > MAX_COMPONENTS)
        continue;
      try {
        entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
      } catch {
        continue;
      }
    }
    return p + 4 <= block.length ? r.u32(p) : 0;
  };
  var parseExif = (bytes) => {
    try {
      const block = findTiffBlock(bytes);
      if (!block || block.length < 8 || block.length > MAX_BLOCK_BYTES)
        return null;
      const order = block[0] === 73 && block[1] === 73 ? "little" : block[0] === 77 && block[1] === 77 ? "big" : null;
      if (!order)
        return null;
      const r = reader(block, order === "little");
      if (r.u16(2) !== 42)
        return null;
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const next = readIfd(r, block, r.u32(4), "image", entries, seen, 0);
      if (next > 0)
        readIfd(r, block, next, "thumbnail", entries, seen, 1);
      const byKey = /* @__PURE__ */ new Map();
      for (const e of entries)
        byKey.set(key(e.ifd, e.tag), e);
      return { byteOrder: order, entries, byKey };
    } catch {
      return null;
    }
  };
  var ratioValue = (v) => {
    if (typeof v === "number")
      return v;
    if (typeof v === "object" && v !== null && "numerator" in v) {
      return v.denominator === 0 ? null : v.numerator / v.denominator;
    }
    return null;
  };
  var exifNumber = (data, ifd, tag) => {
    const e = data.byKey.get(key(ifd, tag));
    return e ? ratioValue(e.value) : null;
  };
  var TAG_X_RESOLUTION = 282;
  var TAG_Y_RESOLUTION = 283;
  var TAG_RESOLUTION_UNIT = 296;
  var exifResolution = (data) => {
    const x = exifNumber(data, "image", TAG_X_RESOLUTION);
    const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
    if (x === null || y === null || x <= 0 || y <= 0)
      return null;
    const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
    if (unit === 2)
      return { x, y };
    if (unit === 3)
      return { x: x * CM_PER_INCH, y: y * CM_PER_INCH };
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dimensions.js
  var measurePng = (b) => {
    const width = be32(b, 16);
    const height = be32(b, 20);
    let density = null;
    let p = 8;
    while (p + 8 <= b.length) {
      const len = be32(b, p);
      const type = p + 4;
      if (matchAscii(b, type, "IDAT") || matchAscii(b, type, "IEND"))
        break;
      if (matchAscii(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
        const d = p + 8;
        const perMetreX = be32(b, d);
        const perMetreY = be32(b, d + 4);
        if (u8(b, d + 8) === 1 && perMetreX > 0 && perMetreY > 0) {
          density = {
            x: perMetreX * MM_PER_INCH / MM_PER_METRE,
            y: perMetreY * MM_PER_INCH / MM_PER_METRE,
            source: "png-phys"
          };
        }
        break;
      }
      p += 12 + len;
    }
    return { format: "png", width, height, density };
  };
  var isSof = (m) => m >= 192 && m <= 195 || m >= 197 && m <= 199 || m >= 201 && m <= 203 || m >= 205 && m <= 207;
  var measureJpeg = (b) => {
    let density = null;
    let p = 2;
    while (p + 4 <= b.length) {
      if (u8(b, p) !== 255) {
        p += 1;
        continue;
      }
      const marker = u8(b, p + 1);
      if (marker === 255) {
        p += 1;
        continue;
      }
      if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
        p += 2;
        continue;
      }
      const len = be16(b, p + 2);
      if (len < 2)
        break;
      const payload = p + 4;
      if (isSof(marker)) {
        return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
      }
      if (marker === 224 && matchAscii(b, payload, "JFIF\0")) {
        const units = u8(b, payload + 7);
        const x = be16(b, payload + 8);
        const y = be16(b, payload + 10);
        if (x > 0 && y > 0) {
          if (units === 1)
            density = { x, y, source: "jfif" };
          else if (units === 2) {
            density = { x: x * CM_PER_INCH, y: y * CM_PER_INCH, source: "jfif" };
          }
        }
      }
      if (marker === 218)
        break;
      p = payload + len - 2;
    }
    throw new RangeError("no start-of-frame segment found");
  };
  var measureGif = (b) => ({
    format: "gif",
    width: le16(b, 6),
    height: le16(b, 8),
    density: null
  });
  var measureWebp = (b) => {
    const fourcc = String.fromCharCode(u8(b, 12), u8(b, 13), u8(b, 14), u8(b, 15));
    const data = 20;
    if (fourcc === "VP8X") {
      return {
        format: "webp",
        width: le24(b, data + 4) + 1,
        height: le24(b, data + 7) + 1,
        density: null
      };
    }
    if (fourcc === "VP8 ") {
      return {
        format: "webp",
        width: le16(b, data + 6) & 16383,
        height: le16(b, data + 8) & 16383,
        density: null
      };
    }
    if (fourcc === "VP8L") {
      if (u8(b, data) !== 47)
        throw new RangeError("VP8L signature byte missing");
      const bits = u8(b, data + 1) | u8(b, data + 2) << 8 | u8(b, data + 3) << 16 | u8(b, data + 4) << 24;
      return {
        format: "webp",
        width: (bits & 16383) + 1,
        height: (bits >>> 14 & 16383) + 1,
        density: null
      };
    }
    throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
  };
  var MEASURERS = {
    png: measurePng,
    jpeg: measureJpeg,
    gif: measureGif,
    webp: measureWebp
  };
  var measureImage = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === null)
      return null;
    try {
      const m = MEASURERS[format](bytes);
      if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
        return null;
      }
      if (m.density === null) {
        const exif = parseExif(bytes);
        const res = exif ? exifResolution(exif) : null;
        if (res)
          m.density = { x: res.x, y: res.y, source: "exif" };
      }
      return m;
    } catch {
      return null;
    }
  };

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
  var readHeaderBytes = async (file, n = HEADER_BYTES) => {
    const buf = await file.slice(0, n).arrayBuffer();
    return new Uint8Array(buf);
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
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
  var MAX_ARTWORK_PIXELS = 5e7;
  var MAX_MARK_PIXELS = 16e6;
  var MAX_TEXT_LENGTH = 64;
  var isTooLarge = (size, ceiling) => size.width * size.height > ceiling;
  var megapixels = (size) => Math.round(size.width * size.height / 1e5) / 10;
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
    const oversizedArtwork = (mp) => `That image is ${mp} megapixels, and marking it would need several times that in memory \u2014 enough to bring this tab down. Save a copy at a smaller size and mark that.`;
    const oversizedMark = (mp) => `That logo is ${mp} megapixels. A watermark is drawn small whatever it starts at, so use a more ordinary export of it.`;
    const refuseIfOversized = async (file, ceiling, message) => {
      const header = measureImage(await readHeaderBytes(file));
      if (!header || !isTooLarge(header, ceiling)) return false;
      showError(message(megapixels(header)));
      return true;
    };
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
      const text = state.text.trim().slice(0, MAX_TEXT_LENGTH);
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
      const projected = state.style === "tiled" ? Math.round(Math.min(size.width, size.height) * TILE_WIDTH_FRACTION) : Math.round(size.width * CENTRAL_WIDTH_FRACTION);
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
        void (async () => {
          if (await refuseIfOversized(file, MAX_ARTWORK_PIXELS, oversizedArtwork)) return;
          const bitmap = await createImageBitmap(file);
          state.artwork?.bitmap.close();
          state.artwork = { bitmap, name: file.name };
          if (controls) controls.hidden = false;
          draw();
        })().catch(
          () => showError(
            "That file could not be opened as an image. PNG, JPEG, GIF and WebP all work; a HEIC from an iPhone needs exporting as JPEG first."
          )
        );
      }
    });
    const textInput = el(root, "[data-wm-text]");
    if (textInput) {
      textInput.maxLength = MAX_TEXT_LENGTH;
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
      void (async () => {
        if (await refuseIfOversized(file, MAX_MARK_PIXELS, oversizedMark)) return;
        const bitmap = await createImageBitmap(file);
        state.markImage?.close();
        state.markImage = bitmap;
        draw();
      })().catch(
        () => showError("That logo could not be opened. A PNG with transparency works best.")
      );
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
