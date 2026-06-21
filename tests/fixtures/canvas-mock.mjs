/**
 * Minimal Canvas mock for Node.js test environment.
 *
 * watermarkEngine.getAlphaMap() calls document.createElement('canvas')
 * and ctx.getImageData(). This mock provides a bare-minimum canvas so
 * tests can verify the pipeline executes without crashing. Actual
 * pixel accuracy is tested elsewhere.
 *
 * Usage: node --import ./tests/fixtures/canvas-mock.mjs --test ...
 */

// Store pre-decoded image info: dataURL → { width, height, raw }
const _cache = new Map();

// Parse PNG dimensions from IHDR chunk (first 24 bytes contain dimensions)
function pngDimensions(buf) {
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Mock Image
globalThis.Image = class {
    set src(url) {
        this._src = url;
        if (url.startsWith('data:')) {
            const b64 = url.includes(';base64,') ? url.split(';base64,')[1] : url;
            const buf = Buffer.from(b64, 'base64');
            const dims = pngDimensions(buf);
            if (dims) {
                this.width = dims.width;
                this.height = dims.height;
                _cache.set(url, { ...dims, raw: buf });
                this.onload?.();
                return;
            }
        }
        this.onerror?.(new Error('Image load failed'));
    }
    get src() { return this._src; }
};

// Mock canvas
globalThis.document = {
    createElement(tag) {
        if (tag === 'canvas') {
            return {
                width: 0, height: 0,
                _imgSrc: null, _resizeW: 0, _resizeH: 0,
                getContext() { return this._ctx || (this._ctx = {
                    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
                        this._canvas._imgSrc = img.src;
                        this._canvas._resizeW = dw || sw;
                        this._canvas._resizeH = dh || sh;
                    },
                    getImageData() {
                        const info = _cache.get(this._canvas._imgSrc);
                        const w = this._canvas._resizeW || info?.width || 1;
                        const h = this._canvas._resizeH || info?.height || 1;
                        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
                    },
                    _canvas: this
                }); }
            };
        }
        return {};
    }
};
