import { removeWatermark } from './blendModes.js';

self.onmessage = function (e) {
  const { imageData, matches, taskId } = e.data;

  try {
    if (matches && matches.length > 0) {
      for (const match of matches) {
        removeWatermark(imageData, match.alphaMap, match.pos);
      }
    }

    self.postMessage({ imageData, taskId }, [imageData.data.buffer]);
  } catch (err) {
    self.postMessage({ taskId, error: err.message });
  }
};

