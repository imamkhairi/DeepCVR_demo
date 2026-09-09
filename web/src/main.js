import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { DATASETS, DEEPCVR_OPACITY_POINTS, DIP_OPACITY_POINTS, extractFirstChannel, getComparisonSources, invertUint8, normalizeToUint8, parseNpy, rotationDelta, VIEWER_RENDERING } from './volume-data.js';
import './style.css';

const selector = document.querySelector('#dataset');
const autoRotateInput = document.querySelector('#auto-rotate');
for (const dataset of DATASETS) selector.add(new Option(dataset.label, dataset.id));

function createViewer(container, opacityPoints) {
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    rootContainer: container,
    background: [0.015, 0.027, 0.05],
    containerStyle: { height: '100%', width: '100%', position: 'absolute' },
  });
  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();
  const imageData = vtkImageData.newInstance();
  const mapper = vtkVolumeMapper.newInstance();
  const volume = vtkVolume.newInstance();
  const color = vtkColorTransferFunction.newInstance();
  const opacity = vtkPiecewiseFunction.newInstance();

  color.addRGBPoint(0, 0.02, 0.02, 0.08);
  color.addRGBPoint(70, 0.08, 0.28, 0.62);
  color.addRGBPoint(150, 0.14, 0.76, 0.61);
  color.addRGBPoint(255, 1, 0.88, 0.34);
  for (const [intensity, alpha] of opacityPoints) opacity.addPoint(intensity, alpha);

  mapper.setInputData(imageData);
  mapper.setSampleDistance(VIEWER_RENDERING.sampleDistance);
  volume.setMapper(mapper);
  volume.getProperty().setRGBTransferFunction(0, color);
  volume.getProperty().setScalarOpacity(0, opacity);
  volume.getProperty().setInterpolationTypeToLinear();
  volume.getProperty().setShade(VIEWER_RENDERING.shade);
  volume.getProperty().setAmbient(VIEWER_RENDERING.ambient);
  volume.getProperty().setDiffuse(VIEWER_RENDERING.diffuse);
  renderer.addVolume(volume);

  return { fullScreenRenderer, imageData, interactor: renderWindow.getInteractor(), renderer };
}

const deepcvrViewer = createViewer(document.querySelector('#deepcvr-window'), DEEPCVR_OPACITY_POINTS);
const dipViewer = createViewer(document.querySelector('#dip-window'), DIP_OPACITY_POINTS);
let synchronizingCamera = false;

function copyOrientation(source, target) {
  if (synchronizingCamera) return;
  synchronizingCamera = true;
  const sourceCamera = source.renderer.getActiveCamera();
  const targetCamera = target.renderer.getActiveCamera();
  targetCamera.setPosition(...sourceCamera.getPosition());
  targetCamera.setFocalPoint(...sourceCamera.getFocalPoint());
  targetCamera.setViewUp(...sourceCamera.getViewUp());
  targetCamera.setParallelProjection(sourceCamera.getParallelProjection());
  targetCamera.setParallelScale(sourceCamera.getParallelScale());
  targetCamera.orthogonalizeViewUp();
  source.renderer.updateLightsGeometryToFollowCamera();
  target.renderer.updateLightsGeometryToFollowCamera();
  target.renderer.resetCameraClippingRange();
  target.interactor.render();
  synchronizingCamera = false;
}

deepcvrViewer.renderer.getActiveCamera().onModified(() => copyOrientation(deepcvrViewer, dipViewer));
dipViewer.renderer.getActiveCamera().onModified(() => copyOrientation(dipViewer, deepcvrViewer));

function setVolume(viewer, parsed) {
  const values = extractFirstChannel(parsed);
  const [,, z, y, x] = parsed.shape;
  viewer.imageData.setDimensions(x, y, z);
  viewer.imageData.setSpacing(1, 1, 6);
  viewer.imageData.getPointData().setScalars(vtkDataArray.newInstance({
    name: 'intensity', values: invertUint8(normalizeToUint8(values)), numberOfComponents: 1,
  }));
  viewer.imageData.modified();
}

async function fetchVolume(path) {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw new Error(`The data file could not be loaded (${response.status}).`);
  return parseNpy(await response.arrayBuffer());
}

async function loadComparison(id) {
  const dataset = DATASETS.find((entry) => entry.id === id);
  selector.disabled = true;
  try {
    const sources = getComparisonSources(dataset);
    const [deepcvrData, dipData] = await Promise.all([fetchVolume(sources.deepcvr), fetchVolume(sources.dip)]);
    setVolume(deepcvrViewer, deepcvrData);
    setVolume(dipViewer, dipData);
    deepcvrViewer.renderer.resetCamera();
    dipViewer.renderer.resetCamera();
    copyOrientation(deepcvrViewer, dipViewer);
    deepcvrViewer.interactor.render();
    dipViewer.interactor.render();
    syncAutoRotation();
  } catch (error) {
    console.error('Unable to display the selected reconstruction comparison.', error);
  } finally {
    selector.disabled = false;
  }
}

const rotationRequester = {};
let previousFrame = performance.now();
let rotationRunning = false;
deepcvrViewer.interactor.onAnimation(() => {
  const now = performance.now();
  const angle = rotationDelta((now - previousFrame) / 1000, autoRotateInput.checked);
  previousFrame = now;
  if (angle) {
    deepcvrViewer.renderer.getActiveCamera().azimuth(angle);
    deepcvrViewer.renderer.getActiveCamera().orthogonalizeViewUp();
    deepcvrViewer.renderer.resetCameraClippingRange();
    deepcvrViewer.renderer.updateLightsGeometryToFollowCamera();
  }
});

function syncAutoRotation() {
  previousFrame = performance.now();
  if (autoRotateInput.checked && !rotationRunning) {
    deepcvrViewer.interactor.requestAnimation(rotationRequester);
    rotationRunning = true;
  } else if (!autoRotateInput.checked && rotationRunning) {
    deepcvrViewer.interactor.cancelAnimation(rotationRequester, true);
    rotationRunning = false;
  }
}

selector.addEventListener('change', () => loadComparison(selector.value));
autoRotateInput.addEventListener('change', syncAutoRotation);
window.addEventListener('resize', () => {
  deepcvrViewer.fullScreenRenderer.resize();
  dipViewer.fullScreenRenderer.resize();
});
loadComparison(DATASETS[0].id);
