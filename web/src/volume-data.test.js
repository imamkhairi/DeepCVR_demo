import { describe, expect, it } from 'vitest';
import {
  DATASETS,
  DEEPCVR_OPACITY_POINTS,
  DIP_OPACITY_POINTS,
  extractFirstChannel,
  getComparisonSources,
  invertUint8,
  normalizeToUint8,
  parseNpy,
  rotationDelta,
  VIEWER_RENDERING,
} from './volume-data.js';

function npyV1Float32(values, shape) {
  const header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(', ')},), }`;
  const prefixLength = 10;
  const padding = 16 - ((prefixLength + header.length + 1) % 16);
  const encodedHeader = new TextEncoder().encode(`${header}${' '.repeat(padding)}\n`);
  const bytes = new Uint8Array(prefixLength + encodedHeader.length + values.byteLength);
  bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0);
  new DataView(bytes.buffer).setUint16(8, encodedHeader.length, true);
  bytes.set(encodedHeader, prefixLength);
  bytes.set(new Uint8Array(values.buffer), prefixLength + encodedHeader.length);
  return bytes.buffer;
}

describe('volume data', () => {
  it('parses little-endian float32 NPY data', () => {
    const parsed = parseNpy(npyV1Float32(new Float32Array([1, 2]), [1, 1, 1, 1, 2]));
    expect(parsed.shape).toEqual([1, 1, 1, 1, 2]);
    expect([...parsed.data]).toEqual([1, 2]);
  });

  it('extracts the first channel of a five-dimensional reconstruction', () => {
    const values = new Float32Array([2, 4, 6, 8]);
    expect([...extractFirstChannel({ shape: [1, 1, 1, 2, 2], data: values })]).toEqual([2, 4, 6, 8]);
  });

  it('rejects a reconstruction with an unsupported shape', () => {
    expect(() => extractFirstChannel({ shape: [11, 384, 384], data: new Float32Array() }))
      .toThrow('Expected a five-dimensional reconstruction');
  });

  it('normalizes a finite scalar range to byte intensity', () => {
    expect([...normalizeToUint8(new Float32Array([2, 4, 6]))]).toEqual([0, 128, 255]);
  });

  it('inverts values after they have been normalized to the 0–255 range', () => {
    const normalized = normalizeToUint8(new Float32Array([2, 4, 6]));
    expect([...invertUint8(normalized)]).toEqual([255, 127, 0]);
  });

  it('uses current_flip for DeepCVR and current_flip_dip for DIP', () => {
    expect(DEEPCVR_OPACITY_POINTS).toEqual([
      [0, 0.04], [2, 0], [25, 0], [50, 0.05], [100, 0.07],
      [150, 0.11], [200, 0.2], [256, 0],
    ]);
    expect(DIP_OPACITY_POINTS).toEqual([
      [0, 0.04], [2, 0], [20, 0], [25, 0.03], [50, 0.05],
      [100, 0.07], [150, 0.11], [200, 0.2], [256, 0],
    ]);
  });

  it('rotates only while auto-rotation is enabled', () => {
    expect(rotationDelta(2, true)).toBe(90);
    expect(rotationDelta(2, false)).toBe(0);
  });

  it('uses one shared volume-material configuration for both panels', () => {
    expect(VIEWER_RENDERING).toEqual({
      ambient: 0.25,
      diffuse: 0.75,
      sampleDistance: 0.7,
      shade: true,
    });
  });

  it('lists each supplied public reconstruction exactly once', () => {
    expect(DATASETS.map(({ id }) => id)).toEqual(['HSIL04', 'LSIL20', 'NILM15', 'SCC77']);
  });

  it('maps a selected dataset to matching DeepCVR and DIP files', () => {
    expect(getComparisonSources(DATASETS[0])).toEqual({
      deepcvr: 'data/HSIL04_recon.npy',
      dip: 'data/dip/HSIL04.npy',
    });
  });
});
