import { describe, expect, it } from 'vitest';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import * as volumeData from './volume-data.js';
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

  it('uses one shared unlit volume-material configuration for both panels', () => {
    expect(VIEWER_RENDERING).toEqual({
      ambient: 0.25,
      diffuse: 0.75,
      sampleDistance: 0.7,
      shade: false,
    });
  });

  it('attaches a populated volume exactly once and rejects an empty image', () => {
    expect(typeof volumeData.attachVolumeWhenReady).toBe('function');
    if (typeof volumeData.attachVolumeWhenReady !== 'function') return;

    const imageData = vtkImageData.newInstance();
    const mapper = vtkVolumeMapper.newInstance();
    const volume = vtkVolume.newInstance();
    const renderer = vtkRenderer.newInstance();
    mapper.setInputData(imageData);
    volume.setMapper(mapper);
    const viewer = { imageData, renderer, volume, volumeAttached: false };

    expect(() => volumeData.attachVolumeWhenReady(viewer)).toThrow('before its image data is populated');

    imageData.setDimensions(1, 1, 1);
    imageData.getPointData().setScalars(vtkDataArray.newInstance({
      name: 'intensity', values: new Uint8Array([255]), numberOfComponents: 1,
    }));
    volumeData.attachVolumeWhenReady(viewer);
    volumeData.attachVolumeWhenReady(viewer);

    expect(renderer.getVolumes()).toEqual([volume]);
    expect(viewer.volumeAttached).toBe(true);

    renderer.delete();
    volume.delete();
    mapper.delete();
    imageData.delete();
  });

  it('loads and applies DeepCVR before requesting DIP', async () => {
    expect(typeof volumeData.loadComparisonVolumes).toBe('function');
    if (typeof volumeData.loadComparisonVolumes !== 'function') return;

    const events = [];
    await volumeData.loadComparisonVolumes(
      { deepcvr: 'deep.npy', dip: 'dip.npy' },
      async (path) => {
        events.push(`load:${path}`);
        return path.toUpperCase();
      },
      (kind, data) => events.push(`apply:${kind}:${data}`),
    );

    expect(events).toEqual([
      'load:deep.npy',
      'apply:deepcvr:DEEP.NPY',
      'load:dip.npy',
      'apply:dip:DIP.NPY',
    ]);
  });

  it('resizes and refits a viewer only after its volume is attached', () => {
    expect(typeof volumeData.fitViewerToVolume).toBe('function');
    if (typeof volumeData.fitViewerToVolume !== 'function') return;

    const events = [];
    const viewer = {
      fullScreenRenderer: { resize: () => events.push('resize') },
      interactor: { render: () => events.push('render') },
      renderer: {
        resetCamera: () => events.push('camera'),
        resetCameraClippingRange: () => events.push('clipping'),
      },
      volumeAttached: false,
    };

    volumeData.fitViewerToVolume(viewer);
    viewer.volumeAttached = true;
    volumeData.fitViewerToVolume(viewer);

    expect(events).toEqual(['resize', 'resize', 'camera', 'clipping', 'render']);
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
