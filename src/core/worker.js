import { removeWatermark } from './blendModes.js';

self.onmessage = function(e) {
    const { imageData, alphaMap, position } = e.data;
    
    // Use the unified removal logic
    removeWatermark(imageData, alphaMap, position);

    // Transfer the buffer back to main thread
    self.postMessage({ imageData }, [imageData.data.buffer]);
};

