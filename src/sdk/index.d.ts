export interface GwrImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ManualConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  assetKey?: string;
  forceProcess?: boolean;
  alphaGainOverride?: number;
  searchRangeOverride?: number;
}

export interface DetectionOptions {
  deepScan?: boolean;
  noiseReduction?: boolean;
  probeThreshold?: number;
  fallbackThreshold?: number;
  globalFallback?: boolean;
  globalFallbackBelow?: number;
  autoNonCatalogMinConfidence?: number;
  manualConfig?: ManualConfig;
  overrides?: Record<string, unknown>;
  adaptiveMode?: boolean | 'off';
  adaptiveMinConfidence?: number;
  globalFreeMinConfidence?: number;
  positionTolerance?: number;
  candidateValidation?: boolean;
  startingPassIndex?: number;
}

export interface WatermarkPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: string;
}

export interface WatermarkMatch {
  config: Record<string, unknown>;
  pos: WatermarkPosition;
  alphaMap: Float32Array;
  alphaBias?: number;
  assetKey?: string | null;
  confidence: number;
  profileId: string;
  source: string;
  removalResult?: RemovalResult;
}

export interface DetectionTrace {
  profileId: string;
  candidateCount: number;
  acceptedCount: number;
  candidates: Array<Record<string, unknown>>;
  validations: Array<Record<string, unknown>>;
  decisionTier: string;
  winner: Record<string, unknown> | null;
}

export interface RemovalResult {
  applied: boolean;
  changedPixels: number;
  maxChannelDelta: number;
  stopReason: string;
  passCount: number;
  attemptedPassCount: number;
}

export interface RemovalReport {
  attemptedCount: number;
  acceptedCount: number;
  suppressedCount: number;
  appliedCount: number;
  results: RemovalResult[];
}

export interface DetectionResult {
  profileId: string;
  matches: WatermarkMatch[];
  winner: WatermarkMatch | null;
  confidence: number;
  decisionTier?: string;
  trace?: DetectionTrace;
}

export interface MultiPassResult {
  imageData: GwrImageData;
  passCount: number;
  attemptedPassCount: number;
  stopReason: 'max-passes' | 'safety-near-black' | 'safety-texture-collapse' |
    'residual-low' | 'first-pass-sign-flip' | 'no-improvement' | 'restoration-regression';
  passes: Array<{
    index: number;
    beforeSpatialScore: number;
    afterSpatialScore: number;
    improvement: number;
    gradientDelta: number;
    beforeGradientScore: number;
    afterGradientScore: number;
    haloSeverity: number;
    nearBlackRatio: number;
  }>;
}

export interface AdaptiveRegion {
  found: true;
  confidence: number;
  spatialScore: number;
  gradientScore: number;
  varianceScore: number;
  region: WatermarkPosition;
}

export interface SubpixelRefinement {
  imageData: GwrImageData;
  alphaMap: Float32Array;
  alphaGain: number;
  shift: { dx: number; dy: number; scale: number };
  spatialScore: number;
  gradientScore: number;
}

export interface RecalibrationResult {
  imageData: GwrImageData;
  alphaGain: number;
  processedSpatialScore: number;
  suppressionGain: number;
}

export interface DecisionTierResult {
  tier: 'direct-match' | 'needs-validation' | 'insufficient';
  reason?: string;
}

export type ExecutionMode = 'worker-assisted' | 'main-thread';

export class WorkerPool {
  constructor(workerUrl: string | URL, poolSize?: number);
  readonly isAvailable: boolean;
  readonly activeCount: number;
  readonly pendingCount: number;
  postTask(imageData: GwrImageData, matches: WatermarkMatch[]): Promise<Uint8ClampedArray & { removalReport?: RemovalReport }>;
  terminate(): void;
}

export class DetectorContext {
  _blurBuffer: Uint8ClampedArray | null | undefined;
  _sharedGradientsI: Float32Array | null | undefined;
  _sharedGradientsA: Float32Array | null | undefined;
  getBlurBuffer(requiredLength: number): Uint8ClampedArray;
  getGradientBuffers(requiredLength: number): { gradientsI: Float32Array; gradientsA: Float32Array };
  reset(): void;
}

export class WatermarkEngine {
  static create(): Promise<WatermarkEngine>;
  getExecutionMode(): ExecutionMode;
  getAlphaMap(assetKey: string | number, targetW?: number, targetH?: number): Promise<{ data: Float32Array; width: number; height: number }>;
  removeWatermarkFromImage(image: HTMLImageElement | HTMLCanvasElement, options?: DetectionOptions & { profileId?: string }): Promise<{
    canvas: HTMLCanvasElement;
    detectionMode: string;
    confidence: number;
    removedCount: number;
    detectedCount: number;
    removal: RemovalReport | null;
    trace: DetectionTrace | null;
    config: Record<string, unknown> | null;
    pos: WatermarkPosition | null;
    profileId: string;
  }>;
  destroy(): void;
}

export function detectWatermarks(args: {
  imageData: GwrImageData;
  profileId?: string;
  getAlphaMap: (assetKey: string, width: number, height: number) => Promise<{ data: Float32Array; width: number; height: number; assetKey?: string }>;
  options?: DetectionOptions;
}): Promise<DetectionResult>;

export function detectProfileWatermarks(args: {
  imageData: GwrImageData;
  profileId: string;
  getAlphaMap: (assetKey: string, width: number, height: number) => Promise<{ data: Float32Array; width: number; height: number; assetKey?: string }>;
  options?: DetectionOptions;
}): Promise<DetectionResult>;

export function getProfilesToTry(requestedProfileId?: string): string[];

export function calculateAlphaMap(imageData: GwrImageData): Float32Array;

export function removeWatermark(
  imageData: GwrImageData,
  alphaMap: Float32Array,
  pos: WatermarkPosition,
  options?: { alphaGain?: number; alphaNoiseFloor?: number; alphaBias?: number }
): void;

export function calculateWatermarkPosition(imageWidth: number, imageHeight: number, config: Record<string, number | string>): WatermarkPosition;

export function detectWatermarkConfig(imageWidth: number, imageHeight: number, profileId?: string): Record<string, unknown>;

export function getAllPotentialConfigs(imageWidth: number, imageHeight: number, profileId?: string): Record<string, unknown>[];

export const PROFILES: Record<string, Record<string, unknown>>;
export const DEFAULT_PROFILE: Record<string, unknown>;
export const GEMINI_PROFILE: Record<string, unknown>;
export function getProfile(id: string): Record<string, unknown>;
export function getAllProfiles(): Record<string, unknown>[];

export function calculateMSE(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function calculatePSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
/** @deprecated This is a PSNR-derived compatibility estimate, not true SSIM. */
export function calculateSSIM(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function estimateQualityFromPSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;

export const RestorationMetrics: {
  calculateMSE(a: ArrayLike<number>, b: ArrayLike<number>): number;
  calculatePSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
  calculateSSIM(a: ArrayLike<number>, b: ArrayLike<number>): number;
  estimateQualityFromPSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
};

export function detectWatermark(
  imageData: GwrImageData,
  alphaMaps: Record<string, Float32Array | { data: Float32Array }>,
  options?: { deepScan?: boolean; noiseReduction?: boolean; overrides?: Record<string, unknown> },
  context?: DetectorContext
): { x: number; y: number; width: number; height: number; confidence: number; score: number; mode: string } | null;

export function calculateProbeConfidence(
  imageData: GwrImageData,
  pos: WatermarkPosition,
  alphaMap: Float32Array,
  profile?: string,
  options?: { deepScan?: boolean }
): { confidence: number; x: number; y: number };

export function calculateCorrelation(
  imageData: GwrImageData,
  x: number,
  y: number,
  logoW: number,
  logoH: number,
  alphaMap: Float32Array,
  fullPrecision?: boolean
): number;

export function calculateGradientCorrelation(
  imageData: GwrImageData,
  x: number,
  y: number,
  logoW: number,
  logoH: number,
  alphaMap: Float32Array,
  gradientsI: Float32Array,
  gradientsA: Float32Array
): number;

export function resetDetectorBuffers(context?: DetectorContext): void;

export function detectAdaptiveWatermarkRegion(params: {
  imageData: GwrImageData;
  alphaMaps: Record<string, Float32Array>;
  defaultConfig: { logoSize: number; marginRight: number; marginBottom: number };
  threshold?: number;
  maxSearchSize?: number;
}): AdaptiveRegion | null;

export function interpolateAlphaMap(sourceAlpha: Float32Array, sourceWidth: number, targetSize: number, targetHeight?: number, sourceHeight?: number): Float32Array;

export function warpAlphaMap(alphaMap: Float32Array, size: number, options?: { dx?: number; dy?: number; scale?: number }): Float32Array;

export function refineSubpixelOutline(params: {
  sourceImageData: GwrImageData;
  alphaMap: Float32Array;
  position: WatermarkPosition;
  alphaGain: number;
  baselineSpatialScore: number;
  baselineGradientScore: number;
  alphaBias?: number;
  baselineShift?: { dx?: number; dy?: number; scale?: number };
  minGain?: number;
  shiftCandidates?: number[];
  scaleCandidates?: number[];
  minGradientImprovement?: number;
  maxSpatialDrift?: number;
}): SubpixelRefinement | null;

export function classifyStandardWatermarkSignal(params: {
  spatialScore: number;
  gradientScore: number;
}): DecisionTierResult;

export function classifyAdaptiveWatermarkSignal(
  adaptiveResult: AdaptiveRegion | null
): DecisionTierResult;

export function decideDetectionTier(
  result: DetectionResult
): DecisionTierResult & { reason: string };

export function removeRepeatedWatermarkLayers(
  imageDataOrOptions: GwrImageData | {
    imageData: GwrImageData;
    alphaMap: Float32Array;
    position: WatermarkPosition;
    maxPasses?: number;
    residualThreshold?: number;
    startingPassIndex?: number;
    alphaGain?: number;
    alphaBias?: number;
  },
  alphaMapArg?: Float32Array,
  positionArg?: WatermarkPosition,
  optionsArg?: { maxPasses?: number; residualThreshold?: number; startingPassIndex?: number; alphaGain?: number; alphaBias?: number }
): MultiPassResult;

export function shouldRecalibrateAlphaStrength(params: {
  originalScore: number;
  processedScore: number;
  suppressionGain: number;
}): boolean;

export function recalibrateAlphaStrength(params: {
  sourceImageData: GwrImageData;
  alphaMap: Float32Array;
  position: WatermarkPosition;
  originalSpatialScore: number;
  processedSpatialScore: number;
  alphaBias?: number;
}): RecalibrationResult | null;

export const ENGINE_LIMITS: {
  MAX_PIXELS: number;
  MAX_FILE_SIZE: number;
  MAX_CONCURRENCY: number;
};

export function applyRemovalStrategy(
  imageData: GwrImageData,
  matches: WatermarkMatch[]
): RemovalReport;
