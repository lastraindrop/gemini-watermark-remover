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
}

export interface DetectionOptions {
  deepScan?: boolean;
  noiseReduction?: boolean;
  probeThreshold?: number;
  fallbackThreshold?: number;
  gradientPenalty?: number;
  globalFallback?: boolean;
  globalFallbackBelow?: number;
  autoNonCatalogMinConfidence?: number;
  manualConfig?: ManualConfig;
  overrides?: Record<string, unknown>;
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
  confidence: number;
  profileId: string;
  source: string;
}

export interface DetectionResult {
  profileId: string;
  matches: WatermarkMatch[];
  winner: WatermarkMatch | null;
  confidence: number;
}

export class WatermarkEngine {
  static create(): Promise<WatermarkEngine>;
  getExecutionMode(): 'main-thread';
  getAlphaMap(assetKey: string | number, targetW?: number, targetH?: number): Promise<{ data: Float32Array; width: number; height: number }>;
  removeWatermarkFromImage(image: HTMLImageElement | HTMLCanvasElement, options?: DetectionOptions & { profileId?: string }): Promise<{
    canvas: HTMLCanvasElement;
    detectionMode: string;
    confidence: number;
    removedCount: number;
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
export function removeWatermark(imageData: GwrImageData, alphaMap: Float32Array, pos: WatermarkPosition): void;
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
export function calculateSSIM(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function estimateQualityFromPSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
export const RestorationMetrics: {
  calculateMSE(a: ArrayLike<number>, b: ArrayLike<number>): number;
  calculatePSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
  calculateSSIM(a: ArrayLike<number>, b: ArrayLike<number>): number;
  estimateQualityFromPSNR(a: ArrayLike<number>, b: ArrayLike<number>): number;
};
