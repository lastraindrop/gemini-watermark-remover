import { removeWatermark } from './blendModes.js';

self.onmessage = function (e) {
  const { imageData, alphaMap, position, taskId } = e.data;

  try {
    // Use the unified removal logic
    removeWatermark(imageData, alphaMap, position);

    // Transfer the buffer back to main thread with taskId
    self.postMessage({ imageData, taskId }, [imageData.data.buffer]);
  } catch (err) {
    self.postMessage({ taskId, error: err.message });
  }
};

