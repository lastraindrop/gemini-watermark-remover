export { WatermarkEngine } from '../core/watermarkEngine.js';
export { detectWatermarks, detectProfileWatermarks, getProfilesToTry } from '../core/detectionPipeline.js';
export { detectWatermark, calculateProbeConfidence, calculateCorrelation, calculateGradientCorrelation, resetDetectorBuffers, DetectorContext } from '../core/detector.js';
export { detectAdaptiveWatermarkRegion, interpolateAlphaMap, warpAlphaMap, refineSubpixelOutline } from '../core/adaptiveDetector.js';
export { classifyStandardWatermarkSignal, classifyAdaptiveWatermarkSignal, decideDetectionTier } from '../core/decisionPolicy.js';
export { removeRepeatedWatermarkLayers } from '../core/multiPassRemoval.js';
export { recalibrateAlphaStrength, shouldRecalibrateAlphaStrength } from '../core/alphaCalibration.js';
export { calculateAlphaMap } from '../core/alphaMap.js';
export { removeWatermark } from '../core/blendModes.js';
export { PROFILES, DEFAULT_PROFILE, GEMINI_PROFILE, getProfile, getAllProfiles } from '../core/profiles.js';
export { ENGINE_LIMITS, calculateWatermarkPosition, detectWatermarkConfig, getAllPotentialConfigs } from '../core/config.js';
export { RestorationMetrics } from '../core/restorationMetrics.js';
export { applyRemovalStrategy } from '../core/applyRemoval.js';
export { applyEdgeCleanup } from '../core/edgeCleanup.js';
export { WorkerPool } from '../core/workerPool.js';

import { RestorationMetrics } from '../core/restorationMetrics.js';

export const calculateMSE = (buffer1, buffer2) => RestorationMetrics.calculateMSE(buffer1, buffer2);
export const calculatePSNR = (buffer1, buffer2) => RestorationMetrics.calculatePSNR(buffer1, buffer2);
/**
 * @deprecated This is NOT a real SSIM calculation. It is a linear mapping of PSNR values
 * to [0, 1] range. Use calculatePSNR() and estimateQualityFromPSNR() instead.
 * This export is maintained for backward compatibility and will be removed in v3.0.
 */
export const calculateSSIM = (buffer1, buffer2) => RestorationMetrics.estimateQualityFromPSNR(buffer1, buffer2);
export const estimateQualityFromPSNR = (buffer1, buffer2) => RestorationMetrics.estimateQualityFromPSNR(buffer1, buffer2);
