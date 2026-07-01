import { applyRemovalStrategy } from './applyRemoval.js';

self.onmessage = function (e) {
  const { imageData, matches, taskId } = e.data;

  try {
    let removalReport = { attemptedCount: 0, acceptedCount: 0, suppressedCount: 0, appliedCount: 0, results: [] };
    if (matches && matches.length > 0) {
      removalReport = applyRemovalStrategy(imageData, matches);
    }

    self.postMessage({ imageData, removalReport, taskId }, [imageData.data.buffer]);
  } catch (err) {
    self.postMessage({ taskId, error: err.message });
  }
};
