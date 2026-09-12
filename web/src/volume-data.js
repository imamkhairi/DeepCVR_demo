export const DATASETS = [
  { id: 'HSIL04', label: 'HSIL04 reconstruction', file: 'HSIL04_recon.npy' },
  { id: 'LSIL20', label: 'LSIL20 reconstruction', file: 'LSIL20_recon.npy' },
  { id: 'NILM15', label: 'NILM15 reconstruction', file: 'NILM15_recon.npy' },
  { id: 'SCC77', label: 'SCC77 reconstruction', file: 'SCC77_recon.npy' },
];

// Saved from saved_opacity/current_flip.pkl for DeepCVR.
export const DEEPCVR_OPACITY_POINTS = [
  [0, 0.04], [2, 0], [25, 0], [50, 0.05], [100, 0.07],
  [150, 0.11], [200, 0.2], [256, 0],
];

// Saved from saved_opacity/current_flip_dip.pkl for DIP.
export const DIP_OPACITY_POINTS = [
  [0, 0.04], [2, 0], [20, 0], [25, 0.03], [50, 0.05],
  [100, 0.07], [150, 0.11], [200, 0.2], [256, 0],
];

export const VIEWER_RENDERING = {
  ambient: 0.25,
  diffuse: 0.75,
  sampleDistance: 0.7,
  shade: false,
};

function product(values) {
  return values.reduce((total, value) => total * value, 1);
}

export function parseNpy(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50];
  if (magic.some((value, index) => bytes[index] !== value)) {
    throw new Error('The selected file is not a NumPy NPY array.');
  }

  const majorVersion = bytes[6];
  const view = new DataView(buffer);
  const headerLengthSize = majorVersion === 1 ? 2 : majorVersion === 2 ? 4 : 0;
  if (!headerLengthSize) {
    throw new Error(`Unsupported NPY version ${majorVersion}.`);
  }

  const headerLength = headerLengthSize === 2
    ? view.getUint16(8, true)
    : view.getUint32(8, true);
  const headerStart = 8 + headerLengthSize;
  const dataOffset = headerStart + headerLength;
  if (dataOffset > buffer.byteLength) {
    throw new Error('The NumPy header is truncated.');
  }

  const header = new TextDecoder('latin1').decode(bytes.slice(headerStart, dataOffset));
  const descr = header.match(/['\"]descr['\"]\s*:\s*['\"]([^'\"]+)['\"]/);
  const order = header.match(/['\"]fortran_order['\"]\s*:\s*(True|False)/);
  const shapeMatch = header.match(/['\"]shape['\"]\s*:\s*\(([^)]*)\)/);
  if (!descr || !order || !shapeMatch) {
    throw new Error('The NumPy header is malformed.');
  }
  if (order[1] !== 'False') {
    throw new Error('Fortran-ordered NumPy arrays are not supported.');
  }
  if (!['<f4', '<f8'].includes(descr[1])) {
    throw new Error(`Unsupported NumPy data type ${descr[1]}.`);
  }

  const shape = shapeMatch[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(Number);
  if (!shape.length || shape.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('The NumPy array shape is invalid.');
  }

  const bytesPerValue = descr[1] === '<f4' ? 4 : 8;
  const count = product(shape);
  if (dataOffset + count * bytesPerValue > buffer.byteLength) {
    throw new Error('The NumPy array data is truncated.');
  }

  const data = descr[1] === '<f4'
    ? new Float32Array(buffer, dataOffset, count)
    : new Float64Array(buffer, dataOffset, count);
  return { data, shape };
}

export function extractFirstChannel({ data, shape }) {
  if (shape.length !== 5 || shape[0] !== 1 || shape[1] !== 1) {
    throw new Error('Expected a five-dimensional reconstruction shaped (1, 1, Z, Y, X).');
  }
  if (data.length !== product(shape)) {
    throw new Error('The volume data length does not match its shape.');
  }
  return data;
}

export function normalizeToUint8(values) {
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('The volume includes a non-finite intensity value.');
    }
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  const span = high - low || 1;
  return Uint8Array.from(values, (value) => Math.round(((value - low) / span) * 255));
}

export function invertUint8(values) {
  return Uint8Array.from(values, (value) => 255 - value);
}

export function rotationDelta(elapsedSeconds, isEnabled) {
  return isEnabled ? elapsedSeconds * 45 : 0;
}

export function datasetUrl(file) {
  return `${import.meta.env.BASE_URL}data/${file}`;
}

export function getComparisonSources(dataset) {
  return {
    deepcvr: `data/${dataset.file}`,
    dip: `data/dip/${dataset.id}.npy`,
  };
}
