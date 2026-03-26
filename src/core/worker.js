import { removeWatermark } from './blendModes.js';

self.onmessage = function (e) {
  const { imageData, alphaMap, position, taskId } = e.data;

  // Use the unified removal logic
  removeWatermark(imageData, alphaMap, position);

  // Transfer the buffer back to main thread with taskId
  self.postMessage({ imageData, taskId }, [imageData.data.buffer]);
};

