import { applyRemovalStrategy } from './applyRemoval.js';

self.onmessage = function (e) {
  const { imageData, matches, taskId } = e.data;

  try {
    if (matches && matches.length > 0) {
      applyRemovalStrategy(imageData, matches);
    }

    self.postMessage({ imageData, taskId }, [imageData.data.buffer]);
  } catch (err) {
    self.postMessage({ taskId, error: err.message });
  }
};
