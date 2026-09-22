const canvas = document.getElementById('artCanvas');
const ctx = canvas.getContext('2d');
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const imageInput = document.getElementById('imageInput');
const emptyState = document.getElementById('canvasEmpty');
const paletteList = document.getElementById('swatchList');
let sourceImage = null;
let palette = [];
let currentMapped = [];
let currentMode = 'pixel';
let originalFile = null;
let cropPosition = { x: .5, y: .5 };
let cropDrag = null;

const paletteNames = ['Porcelain', 'Butter', 'Marigold', 'Terracotta', 'Coral', 'Brick', 'Moss', 'Sage', 'Pine', 'Sky', 'Denim', 'Plum', 'Ink', 'Umber', 'Clay', 'Rose', 'Stone', 'Smoke', 'Charcoal', 'Olive', 'Cream', 'Rust', 'Dusk', 'Black'];

function makeDemo() {
  sourceCanvas.width = 900; sourceCanvas.height = 900;
  const gradient = sourceCtx.createLinearGradient(0, 0, 900, 900);
  gradient.addColorStop(0, '#f1c59c'); gradient.addColorStop(.55, '#d6765d'); gradient.addColorStop(1, '#243b40');
  sourceCtx.fillStyle = gradient; sourceCtx.fillRect(0, 0, 900, 900);
  sourceCtx.fillStyle = '#e7c87a'; sourceCtx.beginPath(); sourceCtx.arc(680, 155, 92, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#f5e8c9'; sourceCtx.beginPath(); sourceCtx.ellipse(370, 505, 222, 270, -.12, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#c55e4c'; sourceCtx.beginPath(); sourceCtx.ellipse(390, 390, 110, 90, -.12, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#557d72'; sourceCtx.beginPath(); sourceCtx.moveTo(530, 320); sourceCtx.quadraticCurveTo(610, 140, 685, 275); sourceCtx.quadraticCurveTo(620, 290, 530, 320); sourceCtx.fill();
  sourceCtx.fillStyle = '#294d4a'; sourceCtx.beginPath(); sourceCtx.moveTo(535, 350); sourceCtx.quadraticCurveTo(710, 230, 780, 355); sourceCtx.quadraticCurveTo(655, 350, 535, 350); sourceCtx.fill();
  sourceCtx.fillStyle = '#2d4141'; sourceCtx.fillRect(0, 700, 900, 200);
  sourceImage = sourceCanvas;
  document.getElementById('captionText').textContent = 'A quiet study in terracotta and light';
  render();
}

function quantize(rgb, count) {
  const levels = Math.max(2, Math.round(Math.pow(count, 1 / 3)) + 1);
  const step = 255 / (levels - 1);
  return rgb.map(value => Math.round(value / step) * step);
}

function colorHex(color) {
  return '#' + color.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([red, green, blue]) {
  red /= 255; green /= 255; blue /= 255;
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue); const lightness = (max + min) / 2; const delta = max - min;
  if (!delta) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return [(hue * 60 + 360) % 360, saturation, lightness];
}

function hslToRgb([hue, saturation, lightness]) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation; const part = hue / 60; const x = chroma * (1 - Math.abs(part % 2 - 1));
  const base = part < 1 ? [chroma, x, 0] : part < 2 ? [x, chroma, 0] : part < 3 ? [0, chroma, x] : part < 4 ? [0, x, chroma] : part < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = lightness - chroma / 2; return base.map(value => Math.round((value + match) * 255));
}

function adaptiveColor(rgb) {
  const [hue, saturation, lightness] = rgbToHsl(rgb);
  const lightnessBand = Math.round(lightness * 20) / 20;
  const saturationBand = Math.round(saturation * 8) / 8;
  const hueBand = saturationBand < .08 ? 0 : Math.round(hue / 15) * 15;
  return hslToRgb([hueBand % 360, saturationBand, lightnessBand]);
}

function renderPalette(count, unlimited) {
  paletteList.innerHTML = '';
  const visiblePalette = unlimited ? palette.slice(0, 120) : palette;
  visiblePalette.forEach((color, index) => {
    const item = document.createElement('div'); item.className = 'swatch';
    item.innerHTML = `<span class="swatch-color" style="background:${colorHex(color)}"></span><span><b class="swatch-number">${String(index + 1).padStart(2, '0')}</b><span class="swatch-name">${paletteNames[index] || 'Pigment ' + (index + 1)}</span><span class="swatch-hex">${colorHex(color)}</span></span>`;
    paletteList.appendChild(item);
  });
  document.getElementById('paletteTitle').textContent = unlimited ? 'Full color' : `${count} paint pots`;
  document.getElementById('paletteCount').textContent = unlimited ? `${palette.length.toLocaleString()} colors` : `01—${String(count).padStart(2, '0')}`;
  document.getElementById('paletteNote').textContent = unlimited ? 'Nearby colors merge by hue and saturation, while separate light and dark bands preserve shadows and highlights.' : 'Each number corresponds to one paint color in your print.';
}

function render() {
  if (!sourceImage) return;
  emptyState.hidden = true;
  processingState.hidden = false;
  const size = Number(document.getElementById('gridSize').value);
  const paletteSetting = document.getElementById('paletteSize').value;
  const unlimited = paletteSetting === 'unlimited';
  const count = unlimited ? 0 : Number(paletteSetting);
  try {
    renderArtwork(size, count, unlimited);
    document.getElementById('statusText').textContent = 'ready';
  } catch (error) {
    console.error('Pixel art render failed:', error);
    processingState.hidden = true;
    document.getElementById('statusText').textContent = 'render error - see console';
  }
}

function renderArtwork(size, count, unlimited) {
  const activeFilter = document.getElementById('filterMode').value;
  const workingCanvas = document.createElement('canvas'); workingCanvas.width = size; workingCanvas.height = size;
  const workingCtx = workingCanvas.getContext('2d', { willReadFrequently: true });
  workingCtx.imageSmoothingEnabled = false;

  if (activeFilter === 'canva') {
    const retroResult = applyRetroCanvaPixelArtFilter(sourceImage, size);
    palette = retroResult.palette;
    currentMapped = retroResult.mapped;
    renderPalette(16, false);
    const format = getCanvasFormat();
    document.getElementById('artboard').style.aspectRatio = `${format.width}/${format.height}`;
    canvas.width = size; canvas.height = size; ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(retroResult.canvas, 0, 0, size, size);
    drawMode(currentMode, size, currentMapped);
    processingState.hidden = true;
    document.getElementById('dimensionLabel').textContent = `${format.label} · ${size} px · 96 DPI`;
    return;
  }

  drawSourceImage(workingCtx, size, size);
  applyFilter(workingCtx, size, size);
  const filteredImage = workingCtx.getImageData(0, 0, size, size);
  if (activeFilter === 'shape-fill') fillDominantShapes(filteredImage, size, size);
  const pixels = filteredImage.data;
  const canvaFilter = activeFilter === 'canva';
  const effectiveCount = activeFilter === 'none' || activeFilter === 'grayscale' || activeFilter === 'shape-fill' || activeFilter === 'canva' || activeFilter === 'pixel-art' ? count : Math.max(count || 18, 32);
  const canvaPalette = canvaFilter ? buildCanvaPalette(pixels, Math.min(effectiveCount || 24, 24)) : [];
  const colors = canvaFilter ? canvaPalette.slice() : []; const mapped = []; const colorMap = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const sourceColor = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const color = canvaFilter ? nearestColor(sourceColor, canvaPalette) : unlimited ? adaptiveColor(sourceColor) : quantize(sourceColor, effectiveCount || count);
    const key = color.join(',');
    let index = colorMap.get(key);
    if (index === undefined && !canvaFilter && (unlimited || colors.length < effectiveCount)) { index = colors.length; colors.push(color); colorMap.set(key, index); }
    if (index === undefined) {
      index = colors.reduce((best, item, itemIndex) => {
        const distance = item.reduce((sum, value, channel) => sum + (value - color[channel]) ** 2, 0);
        return distance < best.distance ? { index: itemIndex, distance } : best;
      }, { index: 0, distance: Infinity }).index;
    }
    mapped.push(index);
  }
  palette = colors; currentMapped = mapped;
  renderPalette(unlimited ? palette.length : Math.max(count, activeFilter === 'none' || activeFilter === 'grayscale' || activeFilter === 'shape-fill' || activeFilter === 'canva' || activeFilter === 'pixel-art' ? count : 32), unlimited);
  const format = getCanvasFormat();
  document.getElementById('artboard').style.aspectRatio = `${format.width}/${format.height}`;
  canvas.width = size; canvas.height = size; ctx.imageSmoothingEnabled = false;
  const output = ctx.createImageData(size, size);
  mapped.forEach((index, pixelIndex) => { const color = palette[index]; output.data[pixelIndex * 4] = color[0]; output.data[pixelIndex * 4 + 1] = color[1]; output.data[pixelIndex * 4 + 2] = color[2]; output.data[pixelIndex * 4 + 3] = 255; });
  ctx.putImageData(output, 0, 0);
  drawMode(currentMode, size, mapped);
  processingState.hidden = true;
  document.getElementById('dimensionLabel').textContent = `${format.label} · ${size} px · 96 DPI`;
}

function fillDominantShapes(image, width, height) {
  const data = image.data;
  const sourceData = new Uint8ClampedArray(data);
  const visited = new Uint8Array(width * height);
  const labels = new Int32Array(width * height).fill(-1);
  const regions = [];
  const regionColors = [];
  const colorAt = index => [sourceData[index * 4], sourceData[index * 4 + 1], sourceData[index * 4 + 2]];
  const distance = (first, second) => Math.sqrt((first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2);
  const neighbors = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nextX, nextY]) => nextX >= 0 && nextX < width && nextY >= 0 && nextY < height);
  const threshold = 72;
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start]) continue;
    const regionIndex = regions.length;
    const queue = [start]; const region = []; const seed = colorAt(start); visited[start] = 1; labels[start] = regionIndex;
    while (queue.length) {
      const current = queue.pop(); const x = current % width; const y = Math.floor(current / width); region.push(current);
      neighbors(x, y).forEach(([nextX, nextY]) => {
        const next = nextY * width + nextX;
        if (!visited[next] && distance(seed, colorAt(next)) <= threshold) { visited[next] = 1; labels[next] = regionIndex; queue.push(next); }
      });
    }
    regions.push(region);
  }
  regions.forEach(region => {
    if (region.length < 3) { regionColors.push(colorAt(region[0])); return; }
    const histogram = new Map();
    region.forEach(index => {
      const color = colorAt(index); const bucket = color.map(value => Math.round(value / 24) * 24); const key = bucket.join(',');
      histogram.set(key, (histogram.get(key) || 0) + 1);
    });
    const dominant = [...histogram.entries()].sort((first, second) => second[1] - first[1])[0][0].split(',').map(Number);
    regionColors.push(dominant);
    region.forEach(index => { data[index * 4] = dominant[0]; data[index * 4 + 1] = dominant[1]; data[index * 4 + 2] = dominant[2]; });
  });
  splitTonalShapes(image, width, height, labels, neighbors, colorAt);
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width; const y = Math.floor(index / width); const region = labels[index];
    if (region < 0 || region >= regionColors.length) continue;
    const touchesDifferentRegion = neighbors(x, y).some(([nextX, nextY]) => labels[nextY * width + nextX] !== region);
    if (!touchesDifferentRegion) continue;
    const dominant = regionColors[region];
    const outline = dominant.map(value => Math.max(12, Math.round(value * .58)));
    data[index * 4] = outline[0]; data[index * 4 + 1] = outline[1]; data[index * 4 + 2] = outline[2];
  }
}

function splitTonalShapes(image, width, height, labels, neighbors, colorAt) {
  const data = image.data;
  const visited = new Uint8Array(width * height);
  const tonalLabels = new Int32Array(width * height).fill(-1);
  const tonalColors = [];
  const tonalThreshold = 30;
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start]) continue;
    const parent = labels[start]; const seed = colorAt(start); const queue = [start]; const region = []; visited[start] = 1;
    while (queue.length) {
      const current = queue.pop(); const x = current % width; const y = Math.floor(current / width); region.push(current);
      neighbors(x, y).forEach(([nextX, nextY]) => {
        const next = nextY * width + nextX;
        if (!visited[next] && labels[next] === parent && Math.abs(luminance(colorAt(next)) - luminance(seed)) <= tonalThreshold) { visited[next] = 1; queue.push(next); }
      });
    }
    const histogram = new Map();
    region.forEach(index => { const color = colorAt(index); const bucket = color.map(value => Math.round(value / 16) * 16); const key = bucket.join(','); histogram.set(key, (histogram.get(key) || 0) + 1); });
    const dominant = [...histogram.entries()].sort((first, second) => second[1] - first[1])[0][0].split(',').map(Number);
    const tonalIndex = tonalColors.length; tonalColors.push(dominant);
    region.forEach(index => { tonalLabels[index] = tonalIndex; data[index * 4] = dominant[0]; data[index * 4 + 1] = dominant[1]; data[index * 4 + 2] = dominant[2]; });
  }
  for (let index = 0; index < width * height; index += 1) {
    const tonalIndex = tonalLabels[index];
    if (tonalIndex < 0) continue;
    const x = index % width; const y = Math.floor(index / width);
    if (!neighbors(x, y).some(([nextX, nextY]) => tonalLabels[nextY * width + nextX] !== tonalIndex)) continue;
    const color = tonalColors[tonalIndex];
    data[index * 4] = Math.max(10, Math.round(color[0] * .62)); data[index * 4 + 1] = Math.max(10, Math.round(color[1] * .62)); data[index * 4 + 2] = Math.max(10, Math.round(color[2] * .62));
  }
}

function luminance([red, green, blue]) {
  return red * .299 + green * .587 + blue * .114;
}

function nearestColor(sourceColor, colors) {
  return colors.reduce((best, color) => {
    const distance = color.reduce((sum, value, channel) => sum + (value - sourceColor[channel]) ** 2, 0);
    return distance < best.distance ? { color, distance } : best;
  }, { color: colors[0] || sourceColor, distance: Infinity }).color;
}

function findNearestColorIndex(color, centroids) {
  let bestIndex = 0; let bestDistance = Infinity;
  for (let index = 0; index < centroids.length; index += 1) {
    const centroid = centroids[index];
    const distance = (color[0] - centroid[0]) ** 2 + (color[1] - centroid[1]) ** 2 + (color[2] - centroid[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function runKMeansQuantization(samples, k = 16, iterations = 12) {
  if (!samples.length) return Array.from({ length: k }, () => [0, 0, 0]);
  const centroids = Array.from({ length: k }, (_, index) => {
    const sampleIndex = Math.min(samples.length - 1, Math.floor((index + 0.5) * samples.length / k));
    return samples[sampleIndex].slice();
  });

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const buckets = Array.from({ length: k }, () => ({ total: [0, 0, 0], count: 0 }));
    samples.forEach(sample => {
      const closestIndex = findNearestColorIndex(sample, centroids);
      const bucket = buckets[closestIndex];
      bucket.total[0] += sample[0];
      bucket.total[1] += sample[1];
      bucket.total[2] += sample[2];
      bucket.count += 1;
    });

    let changed = false;
    for (let index = 0; index < k; index += 1) {
      const bucket = buckets[index];
      if (!bucket.count) continue;
      const nextCentroid = [
        Math.round(bucket.total[0] / bucket.count),
        Math.round(bucket.total[1] / bucket.count),
        Math.round(bucket.total[2] / bucket.count)
      ];
      if (nextCentroid[0] !== centroids[index][0] || nextCentroid[1] !== centroids[index][1] || nextCentroid[2] !== centroids[index][2]) {
        centroids[index] = nextCentroid;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return centroids;
}

function applyRetroCanvaPixelArtFilter(sourceImage, targetSize) {
  const originalWidth = sourceImage.width || sourceImage.naturalWidth || sourceCanvas.width;
  const originalHeight = sourceImage.height || sourceImage.naturalHeight || sourceCanvas.height;
  const downscaledWidth = Math.max(1, Math.floor(originalWidth / 6));
  const downscaledHeight = Math.max(1, Math.floor(originalHeight / 6));

  const sourceCanvasForProcess = document.createElement('canvas');
  sourceCanvasForProcess.width = originalWidth;
  sourceCanvasForProcess.height = originalHeight;
  const sourceCtxForProcess = sourceCanvasForProcess.getContext('2d', { willReadFrequently: true });
  sourceCtxForProcess.imageSmoothingEnabled = false;
  sourceCtxForProcess.drawImage(sourceImage, 0, 0, originalWidth, originalHeight);

  const lowResCanvas = document.createElement('canvas');
  lowResCanvas.width = downscaledWidth;
  lowResCanvas.height = downscaledHeight;
  const lowResCtx = lowResCanvas.getContext('2d', { willReadFrequently: true });
  lowResCtx.imageSmoothingEnabled = false;
  lowResCtx.drawImage(sourceCanvasForProcess, 0, 0, downscaledWidth, downscaledHeight);

  const lowResImage = lowResCtx.getImageData(0, 0, downscaledWidth, downscaledHeight);
  const lowResPixels = lowResImage.data;
  const samples = [];
  const alphaMask = new Uint8Array(downscaledWidth * downscaledHeight);

  for (let index = 0; index < lowResPixels.length; index += 4) {
    const pixelIndex = index / 4;
    const red = lowResPixels[index];
    const green = lowResPixels[index + 1];
    const blue = lowResPixels[index + 2];
    const alpha = lowResPixels[index + 3];
    alphaMask[pixelIndex] = alpha;
    samples.push([red, green, blue]);
  }

  const centroids = runKMeansQuantization(samples, 16, 12);
  const quantizedLowRes = new Uint8ClampedArray(lowResPixels.length);
  const quantizedLowResPaletteIndex = new Uint8Array(downscaledWidth * downscaledHeight);

  for (let index = 0; index < lowResPixels.length; index += 4) {
    const pixelIndex = index / 4;
    const sample = [lowResPixels[index], lowResPixels[index + 1], lowResPixels[index + 2]];
    const nearestIndex = findNearestColorIndex(sample, centroids);
    quantizedLowResPaletteIndex[pixelIndex] = nearestIndex;
    const color = centroids[nearestIndex];
    quantizedLowRes[index] = color[0];
    quantizedLowRes[index + 1] = color[1];
    quantizedLowRes[index + 2] = color[2];
    quantizedLowRes[index + 3] = alphaMask[pixelIndex] ?? 255;
  }

  const reconstructed = new Uint8ClampedArray(originalWidth * originalHeight * 4);
  for (let y = 0; y < originalHeight; y += 1) {
    const srcY = Math.min(downscaledHeight - 1, Math.floor((y / originalHeight) * downscaledHeight));
    for (let x = 0; x < originalWidth; x += 1) {
      const srcX = Math.min(downscaledWidth - 1, Math.floor((x / originalWidth) * downscaledWidth));
      const sourceIndex = (srcY * downscaledWidth + srcX) * 4;
      const destinationIndex = (y * originalWidth + x) * 4;
      reconstructed[destinationIndex] = quantizedLowRes[sourceIndex];
      reconstructed[destinationIndex + 1] = quantizedLowRes[sourceIndex + 1];
      reconstructed[destinationIndex + 2] = quantizedLowRes[sourceIndex + 2];
      reconstructed[destinationIndex + 3] = quantizedLowRes[sourceIndex + 3];
    }
  }

  const reconstructionCanvas = document.createElement('canvas');
  reconstructionCanvas.width = originalWidth;
  reconstructionCanvas.height = originalHeight;
  const reconstructionCtx = reconstructionCanvas.getContext('2d', { willReadFrequently: true });
  const reconstructedImage = new ImageData(reconstructed, originalWidth, originalHeight);
  reconstructionCtx.putImageData(reconstructedImage, 0, 0);

  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = targetSize;
  previewCanvas.height = targetSize;
  const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.drawImage(reconstructionCanvas, 0, 0, targetSize, targetSize);

  const previewPixels = previewCtx.getImageData(0, 0, targetSize, targetSize).data;
  const mapped = [];
  for (let index = 0; index < previewPixels.length; index += 4) {
    const sample = [previewPixels[index], previewPixels[index + 1], previewPixels[index + 2]];
    mapped.push(findNearestColorIndex(sample, centroids));
  }

  return { palette: centroids, mapped, canvas: previewCanvas, imageData: reconstructedImage, outputPixels: previewPixels };
}

function buildCanvaPalette(pixels, requestedCount) {
  const count = Math.max(2, requestedCount);
  const samples = [];
  for (let index = 0; index < pixels.length; index += 4) {
    if (index % Math.max(4, Math.floor(pixels.length / 320)) !== 0) continue;
    samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
  }
  const palette = samples.slice(0, count).map(color => color.slice());
  while (palette.length < count) palette.push(samples[palette.length % Math.max(1, samples.length)]?.slice() || [128, 128, 128]);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const totals = palette.map(() => [0, 0, 0, 0]);
    samples.forEach(sample => {
      const closest = palette.indexOf(nearestColor(sample, palette));
      totals[closest][0] += sample[0]; totals[closest][1] += sample[1]; totals[closest][2] += sample[2]; totals[closest][3] += 1;
    });
    palette.forEach((color, index) => { if (totals[index][3]) { color[0] = Math.round(totals[index][0] / totals[index][3]); color[1] = Math.round(totals[index][1] / totals[index][3]); color[2] = Math.round(totals[index][2] / totals[index][3]); } });
  }
  return palette;
}

function applyFilter(targetCtx, width, height) {
  const filter = document.getElementById('filterMode').value;
  if (filter === 'none') return;

  const comicLinesEnabled = width === 512;
  const crtLinesEnabled = width >= 128;
  const image = targetCtx.getImageData(0, 0, width, height);
  const data = image.data;
  const clamp = value => Math.max(0, Math.min(255, value));
  const blend = (first, second, amount) => Math.round(first + (second - first) * amount);
  const luminance = (red, green, blue) => red * .299 + green * .587 + blue * .114;
  const gray = (red, green, blue) => Math.round(luminance(red, green, blue) / 255 * 100);

  for (let index = 0; index < data.length; index += 4) {
    const x = (index / 4) % width;
    const y = Math.floor(index / 4 / width);
    let red = data[index];
    let green = data[index + 1];
    let blue = data[index + 2];

    const brightness = luminance(red, green, blue) / 255;

    if (filter === 'grayscale') {
      const value = Math.round((red * .299 + green * .587 + blue * .114));
      red = value; green = value; blue = value;
    } else if (filter === 'pop-art') {
      const average = (red + green + blue) / 3;
      if (average > 150) {
        [red, green, blue] = [255, 214, 124];
      } else if (average > 90) {
        [red, green, blue] = [255, 102, 120];
      } else {
        [red, green, blue] = [88, 120, 255];
      }
      if (brightness > 0.7) {
        [red, green, blue] = [255, 234, 146];
      } else if (brightness < 0.3) {
        [red, green, blue] = [41, 53, 120];
      }
    } else if (filter === 'vintage') {
      const sepiaGrey = Math.round((red * .299 + green * .587 + blue * .114));
      red = clamp(sepiaGrey * 1.5 + 35);
      green = clamp(sepiaGrey * 1.1 + 20);
      blue = clamp(sepiaGrey * 0.72 + 12);
      if (brightness > 0.6) {
        [red, green, blue] = [220, 185, 122];
      } else if (brightness < 0.25) {
        [red, green, blue] = [72, 47, 28];
      }
    } else if (filter === 'retro') {
      const tint = brightness > 0.55 ? [251, 178, 98] : [94, 55, 126];
      red = blend(red, tint[0], 0.9);
      green = blend(green, tint[1], 0.9);
      blue = blend(blue, tint[2], 0.9);
      if (brightness < 0.35) {
        [red, green, blue] = [120, 36, 64];
      }
    } else if (filter === 'pixel-art') {
      red = Math.round(red / 24) * 24;
      green = Math.round(green / 24) * 24;
      blue = Math.round(blue / 24) * 24;
      const contrast = 1.8;
      red = clamp((red - 128) * contrast + 128);
      green = clamp((green - 128) * contrast + 128);
      blue = clamp((blue - 128) * contrast + 128);
    } else if (filter === 'comic') {
      const value = gray(red, green, blue);
      if (value > 70) {
        [red, green, blue] = [255, 223, 115];
      } else if (value > 42) {
        [red, green, blue] = [246, 96, 110];
      } else {
        [red, green, blue] = [60, 90, 180];
      }
      if (comicLinesEnabled && (x + y) % 5 === 0) {
        [red, green, blue] = [20, 20, 24];
      }
    } else if (filter === 'film') {
      const filmGray = gray(red, green, blue);
      red = clamp(filmGray * 1.35 + 28);
      green = clamp(filmGray * 1.12 + 18);
      blue = clamp(filmGray * 0.96 + 24);
      if (brightness > 0.7) {
        [red, green, blue] = [255, 225, 170];
      } else if (brightness < 0.25) {
        [red, green, blue] = [42, 52, 76];
      }
    } else if (filter === 'crt') {
      const scanline = y % 2 === 0 ? 1.22 : 0.8;
      red = clamp(red * scanline * 1.22);
      green = clamp(green * 1.2);
      blue = clamp(blue * 1.35);
      if (crtLinesEnabled && y % 3 === 0) {
        [red, green, blue] = [clamp(red - 28), clamp(green - 24), clamp(blue - 18)];
      }
      if (crtLinesEnabled && (x + y) % 4 === 0) {
        [red, green, blue] = [255, 255, 255];
      }
    } else if (filter === 'duotone') {
      const target = brightness > .55 ? [242, 204, 165] : [24, 74, 96];
      red = blend(red, target[0], 0.9);
      green = blend(green, target[1], 0.9);
      blue = blend(blue, target[2], 0.9);
      if (brightness > 0.75) {
        [red, green, blue] = [255, 203, 152];
      }
    } else if (filter === 'halftone') {
      const pattern = ((x + y) % 4 === 0) ? 1 : 0;
      const threshold = brightness > .52 ? 1 : 0;
      if (pattern || threshold) {
        [red, green, blue] = [255, 235, 184];
      } else {
        [red, green, blue] = [30, 38, 46];
      }
      if ((x + y) % 8 === 0) {
        [red, green, blue] = [255, 255, 255];
      }
    } else if (filter === 'vaporwave') {
      const accent = brightness > .55 ? [255, 150, 220] : [98, 88, 255];
      red = blend(red, accent[0], 0.95);
      green = blend(green, accent[1], 0.95);
      blue = blend(blue, accent[2], 0.95);
      if ((x + y) % 6 < 3) {
        [red, green, blue] = [clamp(red + 30), clamp(green + 18), clamp(blue + 28)];
      }
    } else if (filter === 'canva') {
      const canvaContrast = 1.16;
      red = Math.max(0, Math.min(255, Math.round(((red - 128) * canvaContrast) + 128)));
      green = Math.max(0, Math.min(255, Math.round(((green - 128) * canvaContrast) + 128)));
      blue = Math.max(0, Math.min(255, Math.round(((blue - 128) * canvaContrast) + 128)));
      const canvaLuminance = red * .299 + green * .587 + blue * .114;
      const saturationBoost = canvaLuminance < 128 ? .88 : 1.12;
      red = Math.max(0, Math.min(255, Math.round(canvaLuminance + (red - canvaLuminance) * saturationBoost)));
      green = Math.max(0, Math.min(255, Math.round(canvaLuminance + (green - canvaLuminance) * saturationBoost)));
      blue = Math.max(0, Math.min(255, Math.round(canvaLuminance + (blue - canvaLuminance) * saturationBoost)));
      red = Math.round(red / 24) * 24; green = Math.round(green / 24) * 24; blue = Math.round(blue / 24) * 24;
    }

    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
  }

  targetCtx.putImageData(image, 0, 0);
}

function drawSourceImage(targetCtx, targetWidth, targetHeight) {
  const fitMode = document.getElementById('fitMode').value;
  const sourceWidth = sourceImage.width || sourceImage.naturalWidth;
  const sourceHeight = sourceImage.height || sourceImage.naturalHeight;
  targetCtx.fillStyle = '#fffdf8';
  targetCtx.fillRect(0, 0, targetWidth, targetHeight);
  if (fitMode === 'stretch') {
    targetCtx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
    return;
  }
  const scale = fitMode === 'crop'
    ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const overflowX = drawnWidth - targetWidth;
  const overflowY = drawnHeight - targetHeight;
  const positionX = fitMode === 'crop' ? cropPosition.x : .5;
  const positionY = fitMode === 'crop' ? cropPosition.y : .5;
  targetCtx.drawImage(sourceImage, -overflowX * positionX, -overflowY * positionY, drawnWidth, drawnHeight);
}

function getCanvasFormat() {
  const selected = document.getElementById('printSize').value;
  const orientation = document.getElementById('orientation').value;
  const sourceWidth = sourceImage?.width || sourceCanvas.width || 1;
  const sourceHeight = sourceImage?.height || sourceCanvas.height || 1;
  const imageWidth = 12;
  const formats = {
    image: { width: imageWidth, height: imageWidth * sourceHeight / sourceWidth, label: 'Image ratio' },
    square: { width: 12, height: 12, label: '1:1 · 12 × 12 in' },
    a4: { width: 8.27, height: 11.69, label: 'A4 · 8.27 × 11.69 in' },
    a5: { width: 5.83, height: 8.27, label: 'A5 · 5.83 × 8.27 in' },
    'poster-11x17': { width: 11, height: 17, label: 'Poster · 11 × 17 in' },
    'poster-18x24': { width: 18, height: 24, label: 'Poster · 18 × 24 in' },
    'poster-24x36': { width: 24, height: 36, label: 'Poster · 24 × 36 in' },
    'poster-27x40': { width: 27, height: 40, label: 'Poster · 27 × 40 in' },
    'photo-4x6': { width: 4, height: 6, label: 'Photo · 4 × 6 in' },
    'photo-5x7': { width: 5, height: 7, label: 'Photo · 5 × 7 in' },
    'photo-8x10': { width: 8, height: 10, label: 'Photo · 8 × 10 in' }
  };
  const format = { ...(formats[selected] || formats.image) };
  const shouldBeLandscape = orientation === 'landscape';
  const shouldBePortrait = orientation === 'portrait';
  if ((shouldBeLandscape && format.width < format.height) || (shouldBePortrait && format.width > format.height)) {
    [format.width, format.height] = [format.height, format.width];
  }
  if (orientation !== 'auto' && selected !== 'square') {
    const name = format.label.split(' · ')[0];
    format.label = `${name} · ${format.width.toFixed(2).replace('.00', '')} × ${format.height.toFixed(2).replace('.00', '')} in`;
  }
  return format;
}

function drawMode(mode, size, mapped) {
  if (mode === 'pixel') {
    const pixelCanvas = createPrintCanvas('pixel');
    canvas.width = pixelCanvas.width;
    canvas.height = pixelCanvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelCanvas, 0, 0);
    emptyState.hidden = true;
    return;
  }
  if (mode === 'numbers') {
    const numbersCanvas = createPrintCanvas('numbers');
    canvas.width = numbersCanvas.width;
    canvas.height = numbersCanvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(numbersCanvas, 0, 0);
    emptyState.hidden = true;
    return;
  }
  if (mode === 'blank') {
    const blankCanvas = createPrintCanvas('blank');
    canvas.width = blankCanvas.width;
    canvas.height = blankCanvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(blankCanvas, 0, 0);
    emptyState.hidden = true;
    return;
  }
  emptyState.hidden = true;
}

function drawGrid(size) {
  ctx.save();
  ctx.strokeStyle = 'rgba(39,48,53,.32)';
  ctx.lineWidth = Math.max(1 / size, .35);
  ctx.beginPath();
  for (let line = 0; line <= size; line++) {
    ctx.moveTo(line, 0); ctx.lineTo(line, size);
    ctx.moveTo(0, line); ctx.lineTo(size, line);
  }
  ctx.stroke();
  ctx.restore();
}

function drawNumbers(size, mapped) {
  ctx.save();
  ctx.font = `${Math.max(4, Math.min(14, 420 / size))}px DM Mono`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(.6, 3 / size);
  ctx.strokeStyle = 'rgba(255,253,248,.9)';
  ctx.fillStyle = '#273035';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x;
    const label = String(mapped[index] + 1);
    ctx.strokeText(label, x + .5, y + .5);
    ctx.fillText(label, x + .5, y + .5);
  }
  ctx.restore();
}

function createPrintCanvas(mode = currentMode) {
  const format = getCanvasFormat();
  const printWidth = Math.max(1, Math.round(format.width * 96));
  const printHeight = Math.max(1, Math.round(format.height * 96));
  const gridSize = Number(document.getElementById('gridSize').value);
  const printCanvas = document.createElement('canvas'); printCanvas.width = printWidth; printCanvas.height = printHeight;
  const printCtx = printCanvas.getContext('2d'); printCtx.imageSmoothingEnabled = false;
  if (mode === 'blank') { printCtx.fillStyle = '#fffdf8'; printCtx.fillRect(0, 0, printWidth, printHeight); }
  const cellWidth = printWidth / gridSize;
  const cellHeight = printHeight / gridSize;
  currentMapped.forEach((paletteIndex, index) => {
    const x = (index % gridSize) * cellWidth; const y = Math.floor(index / gridSize) * cellHeight;
    if (mode !== 'blank') { printCtx.fillStyle = colorHex(palette[paletteIndex]); printCtx.fillRect(x, y, cellWidth + .5, cellHeight + .5); }
    if (mode === 'numbers' || mode === 'blank') { printCtx.fillStyle = 'rgba(255,253,248,.72)'; printCtx.fillRect(x, y, cellWidth, cellHeight); printCtx.fillStyle = '#273035'; printCtx.font = `${Math.max(4, Math.floor(Math.min(cellWidth, cellHeight) * .55))}px DM Mono`; printCtx.textAlign = 'center'; printCtx.textBaseline = 'middle'; printCtx.fillText(String(paletteIndex + 1), x + cellWidth / 2, y + cellHeight / 2); }
    if (mode === 'grid' || mode === 'numbers' || mode === 'blank') { printCtx.strokeStyle = '#d9d4ca'; printCtx.lineWidth = Math.max(1, Math.min(printWidth, printHeight) / 2200); printCtx.strokeRect(x, y, cellWidth, cellHeight); }
  });
  return printCanvas;
}

function downloadCanvas(exportCanvas, filename) { const link = document.createElement('a'); link.download = filename; link.href = exportCanvas.toDataURL('image/png'); link.click(); }

function createZip(files) {
  const encoder = new TextEncoder(); const chunks = []; const central = []; let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
  const crc32 = bytes => bytes.reduce((crc, byte) => (crcTable[(crc ^ byte) & 255] ^ crc >>> 8) >>> 0, 0xffffffff) ^ 0xffffffff;
  const u16 = value => [value & 255, value >>> 8 & 255]; const u32 = value => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255];
  files.forEach(file => { const name = encoder.encode(file.name); const data = new Uint8Array(file.data); const crc = crc32(data); const header = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data]); chunks.push(header); central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name])); offset += header.length; });
  const centralOffset = offset; central.forEach(entry => { chunks.push(entry); offset += entry.length; }); chunks.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(offset - centralOffset), ...u32(centralOffset), ...u16(0)])); return new Blob(chunks, { type: 'application/zip' });
}

function canvasBlob(exportCanvas) { return new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png')); }

async function downloadProject() {
  const originalBlob = originalFile || await canvasBlob(sourceImage);
  const pixelBlob = await canvasBlob(createPrintCanvas('pixel'));
  const numbersBlob = await canvasBlob(createPrintCanvas('numbers'));
  const paletteBlob = await canvasBlob(createPaletteCard());
  const files = [{ name: 'original-image.png', data: await originalBlob.arrayBuffer() }, { name: 'pixel-art.png', data: await pixelBlob.arrayBuffer() }, { name: 'paint-by-numbers.png', data: await numbersBlob.arrayBuffer() }, { name: 'palette-card.png', data: await paletteBlob.arrayBuffer() }];
  const zip = createZip(files); const link = document.createElement('a'); link.download = 'pixel-atelier-project.zip'; link.href = URL.createObjectURL(zip); link.click(); URL.revokeObjectURL(link.href);
}

function createPaletteCard() {
  const cardPalette = palette.slice(0, 2400); const columns = 4; const rows = Math.ceil(cardPalette.length / columns); const card = document.createElement('canvas'); card.width = 1400; card.height = Math.max(500, 190 + rows * 105); const cardCtx = card.getContext('2d');
  cardCtx.fillStyle = '#fffdf8'; cardCtx.fillRect(0, 0, card.width, card.height); cardCtx.fillStyle = '#1e2630'; cardCtx.font = '700 46px DM Sans'; cardCtx.fillText('PIXEL ATELIER / PALETTE CARD', 80, 90); cardCtx.font = '24px DM Mono'; cardCtx.fillStyle = '#7c817e'; cardCtx.fillText(`${palette.length.toLocaleString()} colors · 32 in canvas · 96 DPI${palette.length > cardPalette.length ? ' · first 2,400 shown' : ''}`, 80, 135);
  cardPalette.forEach((color, index) => { const column = index % columns; const row = Math.floor(index / columns); const x = 80 + column * 315; const y = 190 + row * 105; cardCtx.fillStyle = colorHex(color); cardCtx.fillRect(x, y, 62, 62); cardCtx.fillStyle = '#1e2630'; cardCtx.font = '22px DM Mono'; cardCtx.fillText(`${String(index + 1).padStart(3, '0')}  ${colorHex(color)}`, x + 80, y + 38); });
  return card;
}

function loadFile(file) { if (!file) return; originalFile = file; const reader = new FileReader(); reader.onload = event => { const image = new Image(); image.onload = () => { sourceImage = image; document.getElementById('captionText').textContent = file.name.replace(/\.[^/.]+$/, '').slice(0, 42); render(); }; image.src = event.target.result; }; reader.readAsDataURL(file); }

function loadTemplate(button) {
  const image = new Image();
  image.onload = () => { originalFile = null; sourceImage = image; document.getElementById('captionText').textContent = button.dataset.caption; render(); };
  image.src = button.dataset.asset;
}

imageInput.addEventListener('change', event => loadFile(event.target.files[0]));
document.getElementById('demoButton').addEventListener('click', makeDemo);
document.querySelectorAll('.template-button').forEach(button => button.addEventListener('click', () => loadTemplate(button)));
['gridSize', 'paletteSize', 'printSize', 'orientation', 'filterMode'].forEach(id => document.getElementById(id).addEventListener('change', render));
document.getElementById('fitMode').addEventListener('change', event => { cropPosition = { x: .5, y: .5 }; document.getElementById('artboard').classList.toggle('crop-enabled', event.currentTarget.value === 'crop'); render(); });
document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.mode-tab').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); }); tab.classList.add('active'); tab.setAttribute('aria-pressed', 'true'); currentMode = tab.dataset.mode; render(); }));
document.getElementById('resetButton').addEventListener('click', () => { sourceImage = null; originalFile = null; palette = []; currentMapped = []; ctx.clearRect(0, 0, canvas.width, canvas.height); emptyState.hidden = false; processingState.hidden = true; paletteList.innerHTML = ''; });
document.getElementById('uploadZone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
document.getElementById('uploadZone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragging'));
document.getElementById('uploadZone').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
document.getElementById('exportButton').addEventListener('click', () => downloadCanvas(createPrintCanvas(), `pixel-atelier-${currentMode}-32in-96dpi.png`));
document.getElementById('savePaletteButton').addEventListener('click', () => downloadCanvas(createPaletteCard(), 'pixel-atelier-palette-card.png'));
document.getElementById('bundleButton').addEventListener('click', downloadProject);

document.getElementById('artboard').addEventListener('pointerdown', event => {
  if (document.getElementById('fitMode').value !== 'crop') return;
  cropDrag = { startX: event.clientX, startY: event.clientY, originX: cropPosition.x, originY: cropPosition.y };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add('is-dragging');
});
document.getElementById('artboard').addEventListener('pointermove', event => {
  if (!cropDrag) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  cropPosition.x = Math.max(0, Math.min(1, cropDrag.originX - (event.clientX - cropDrag.startX) / bounds.width));
  cropPosition.y = Math.max(0, Math.min(1, cropDrag.originY - (event.clientY - cropDrag.startY) / bounds.height));
  render();
});
document.getElementById('artboard').addEventListener('pointerup', event => {
  cropDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});
document.getElementById('artboard').addEventListener('pointercancel', event => {
  cropDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});

makeDemo();

const adPopup = document.getElementById('adPopup');
const closeAdPopup = () => {
  adPopup.hidden = true;
  sessionStorage.setItem('pixelAtelierAdPopupSeen', 'true');
};

document.getElementById('adPopupClose').addEventListener('click', closeAdPopup);
adPopup.addEventListener('click', event => {
  if (event.target === adPopup) closeAdPopup();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !adPopup.hidden) closeAdPopup();
});

if (!sessionStorage.getItem('pixelAtelierAdPopupSeen')) {
  window.setTimeout(() => {
    adPopup.hidden = false;
    document.getElementById('adPopupClose').focus();
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (error) { console.warn('AdSense popup was not ready:', error); }
  }, 8000);
}

try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (error) { console.warn('AdSense banner was not ready:', error); }
/*
const canvas = document.getElementById('artCanvas');
const ctx = canvas.getContext('2d');
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const imageInput = document.getElementById('imageInput');
const emptyState = document.getElementById('canvasEmpty');
const paletteList = document.getElementById('swatchList');
let sourceImage = null;
let palette = [];
let currentMode = 'pixel';

const paletteNames = ['Porcelain', 'Butter', 'Marigold', 'Terracotta', 'Coral', 'Brick', 'Moss', 'Sage', 'Pine', 'Sky', 'Denim', 'Plum', 'Ink', 'Umber', 'Clay', 'Rose', 'Stone', 'Smoke', 'Charcoal', 'Olive', 'Cream', 'Rust', 'Dusk', 'Black'];

function makeDemo() {
  sourceCanvas.width = 900; sourceCanvas.height = 900;
  const g = sourceCtx.createLinearGradient(0, 0, 900, 900);
  g.addColorStop(0, '#f1c59c'); g.addColorStop(0.55, '#d6765d'); g.addColorStop(1, '#243b40');
  sourceCtx.fillStyle = g; sourceCtx.fillRect(0, 0, 900, 900);
  sourceCtx.fillStyle = '#e7c87a'; sourceCtx.beginPath(); sourceCtx.arc(680, 155, 92, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#f5e8c9'; sourceCtx.beginPath(); sourceCtx.ellipse(370, 505, 222, 270, -.12, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#c55e4c'; sourceCtx.beginPath(); sourceCtx.ellipse(390, 390, 110, 90, -.12, 0, Math.PI * 2); sourceCtx.fill();
  sourceCtx.fillStyle = '#557d72'; sourceCtx.beginPath(); sourceCtx.moveTo(530, 320); sourceCtx.quadraticCurveTo(610, 140, 685, 275); sourceCtx.quadraticCurveTo(620, 290, 530, 320); sourceCtx.fill();
  sourceCtx.fillStyle = '#294d4a'; sourceCtx.beginPath(); sourceCtx.moveTo(535, 350); sourceCtx.quadraticCurveTo(710, 230, 780, 355); sourceCtx.quadraticCurveTo(655, 350, 535, 350); sourceCtx.fill();
  sourceCtx.fillStyle = '#2d4141'; sourceCtx.fillRect(0, 700, 900, 200);
  sourceImage = sourceCanvas;
  document.getElementById('captionText').textContent = 'A quiet study in terracotta and light';
  render();
}

function quantize(rgb, count) {
  const levels = Math.max(2, Math.round(Math.pow(count, 1 / 3)) + 1);
  const step = 255 / (levels - 1);
  return rgb.map(value => Math.round(value / step) * step);
}

function renderPalette(count) {
  paletteList.innerHTML = '';
  palette.forEach((color, index) => {
    const item = document.createElement('div'); item.className = 'swatch';
    const hex = '#' + color.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    item.innerHTML = `<span class="swatch-color" style="background:${hex}"></span><span><b class="swatch-number">${String(index + 1).padStart(2, '0')}</b><span class="swatch-name">${paletteNames[index] || 'Pigment ' + (index + 1)}</span><span class="swatch-hex">${hex}</span></span>`;
    paletteList.appendChild(item);
  });
  document.getElementById('paletteTitle').textContent = `${count} paint pots`;
  document.getElementById('paletteCount').textContent = `01—${String(count).padStart(2, '0')}`;
}

function render() {
  if (!sourceImage) return;
  const size = Number(document.getElementById('gridSize').value);
  const count = Number(document.getElementById('paletteSize').value);
  sourceCtx.drawImage(sourceImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const tiny = document.createElement('canvas'); tiny.width = size; tiny.height = size;
  const tinyCtx = tiny.getContext('2d', { willReadFrequently: true });
  tinyCtx.drawImage(sourceCanvas, 0, 0, size, size);
  const pixels = tinyCtx.getImageData(0, 0, size, size).data;
  const colors = []; const mapped = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const color = quantize([pixels[i], pixels[i + 1], pixels[i + 2]], count);
    const key = color.join(',');
    let index = colors.findIndex(item => item.key === key);
    if (index === -1 && colors.length < count) { colors.push({ key, color }); index = colors.length - 1; }
    if (index === -1) { index = colors.reduce((best, item, idx) => { const distance = item.color.reduce((sum, value, channel) => sum + (value - color[channel]) ** 2, 0); return distance < best.distance ? { index: idx, distance } : best; }, { index: 0, distance: Infinity }).index; }
    mapped.push(index);
  }
  palette = colors.map(item => item.color);
  renderPalette(palette.length);
  canvas.width = size; canvas.height = size;
  const output = ctx.createImageData(size, size);
  mapped.forEach((index, i) => { const color = palette[index]; output.data[i * 4] = color[0]; output.data[i * 4 + 1] = color[1]; output.data[i * 4 + 2] = color[2]; output.data[i * 4 + 3] = 255; });
  ctx.putImageData(output, 0, 0);
  if (currentMode === 'numbers') drawNumbers(size, mapped); else emptyState.hidden = true;
  document.getElementById('dimensionLabel').textContent = `${document.getElementById('printSize').value} × ${document.getElementById('printSize').value} in · ${size} px`;
}

function drawNumbers(size, mapped) {
  ctx.save(); ctx.font = `${Math.max(4, 42 / size)}px DM Mono`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cell = 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; ctx.fillStyle = 'rgba(255,253,248,.72)'; ctx.fillRect(x, y, cell, cell); ctx.fillStyle = '#273035'; ctx.fillText(String(mapped[i] + 1), x + .5, y + .5); }
  ctx.restore(); emptyState.hidden = true;
}

function loadFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = event => { const image = new Image(); image.onload = () => { sourceCanvas.width = image.width; sourceCanvas.height = image.height; sourceCtx.drawImage(image, 0, 0); sourceImage = sourceCanvas; document.getElementById('captionText').textContent = file.name.replace(/\.[^/.]+$/, '').slice(0, 42); render(); }; image.src = event.target.result; }; reader.readAsDataURL(file); }

imageInput.addEventListener('change', event => loadFile(event.target.files[0]));
document.getElementById('demoButton').addEventListener('click', makeDemo);
['gridSize', 'paletteSize', 'printSize'].forEach(id => document.getElementById(id).addEventListener('change', render));
document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.mode-tab').forEach(item => item.classList.remove('active')); tab.classList.add('active'); currentMode = tab.dataset.mode; render(); }));
document.getElementById('resetButton').addEventListener('click', () => { sourceImage = null; ctx.clearRect(0, 0, canvas.width, canvas.height); emptyState.hidden = false; paletteList.innerHTML = ''; });
document.getElementById('uploadZone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
document.getElementById('uploadZone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragging'));
document.getElementById('uploadZone').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
document.getElementById('exportButton').addEventListener('click', () => { const link = document.createElement('a'); link.download = `pixel-atelier-${currentMode}.png`; link.href = canvas.toDataURL('image/png'); link.click(); });
document.getElementById('savePaletteButton').addEventListener('click', () => { const link = document.createElement('a'); link.download = 'pixel-atelier-palette.png'; link.href = canvas.toDataURL('image/png'); link.click(); });

makeDemo();
  if (index === -1 && colors.length < count) { colors.push({ key, color }); index = colors.length - 1; }
    if (index === -1) { index = colors.reduce((best, item, idx) => { const distance = item.color.reduce((sum, value, channel) => sum + (value - color[channel]) ** 2, 0); return distance < best.distance ? { index: idx, distance } : best; }, { index: 0, distance: Infinity }).index; }
    mapped.push(index);
  }
  palette = colors.map(item => item.color);
  renderPalette(palette.length);
  canvas.width = size; canvas.height = size;
  const output = ctx.createImageData(size, size);
  mapped.forEach((index, i) => { const color = palette[index]; output.data[i * 4] = color[0]; output.data[i * 4 + 1] = color[1]; output.data[i * 4 + 2] = color[2]; output.data[i * 4 + 3] = 255; });
  ctx.putImageData(output, 0, 0);
  if (currentMode === 'numbers') drawNumbers(size, mapped); else emptyState.hidden = true;
  document.getElementById('dimensionLabel').textContent = `${document.getElementById('printSize').value} × ${document.getElementById('printSize').value} in · ${size} px`;
}

function drawNumbers(size, mapped) {
  ctx.save(); ctx.font = `${Math.max(4, 42 / size)}px DM Mono`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cell = 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; ctx.fillStyle = 'rgba(255,253,248,.72)'; ctx.fillRect(x, y, cell, cell); ctx.fillStyle = '#273035'; ctx.fillText(String(mapped[i] + 1), x + .5, y + .5); }
  ctx.restore(); emptyState.hidden = true;
}

function loadFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = event => { const image = new Image(); image.onload = () => { sourceCanvas.width = image.width; sourceCanvas.height = image.height; sourceCtx.drawImage(image, 0, 0); sourceImage = sourceCanvas; document.getElementById('captionText').textContent = file.name.replace(/\.[^/.]+$/, '').slice(0, 42); render(); }; image.src = event.target.result; }; reader.readAsDataURL(file); }

imageInput.addEventListener('change', event => loadFile(event.target.files[0]));
document.getElementById('demoButton').addEventListener('click', makeDemo);
['gridSize', 'paletteSize', 'printSize'].forEach(id => document.getElementById(id).addEventListener('change', render));
document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.mode-tab').forEach(item => item.classList.remove('active')); tab.classList.add('active'); currentMode = tab.dataset.mode; render(); }));
document.getElementById('resetButton').addEventListener('click', () => { sourceImage = null; ctx.clearRect(0, 0, canvas.width, canvas.height); emptyState.hidden = false; paletteList.innerHTML = ''; });
document.getElementById('uploadZone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
document.getElementById('uploadZone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragging'));
document.getElementById('uploadZone').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
document.getElementById('exportButton').addEventListener('click', () => { const link = document.createElement('a'); link.download = `pixel-atelier-${currentMode}.png`; link.href = canvas.toDataURL('image/png'); link.click(); });
document.getElementById('savePaletteButton').addEventListener('click', () => { const link = document.createElement('a'); link.download = 'pixel-atelier-palette.png'; link.href = canvas.toDataURL('image/png'); link.click(); });

makeDemo();
*/