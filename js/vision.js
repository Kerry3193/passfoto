// Gesichtserkennung + Personen-Segmentierung (MediaPipe Tasks Vision, lokal eingebunden)
const VENDOR = new URL('../vendor/', import.meta.url).href;

let mp = null, fileset = null;
let imageLandmarker = null, videoLandmarker = null, segmenter = null;
let loading = null;

async function base() {
  if (fileset) return;
  mp = await import('../vendor/mediapipe/vision_bundle.mjs');
  fileset = await mp.FilesetResolver.forVisionTasks(VENDOR + 'mediapipe/wasm');
}

async function create(Cls, opts) {
  try {
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
  } catch (e) {
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  }
}

export function initVision() {
  if (!loading) {
    loading = (async () => {
      await base();
      imageLandmarker = await create(mp.FaceLandmarker, {
        baseOptions: { modelAssetPath: VENDOR + 'models/face_landmarker.task' },
        runningMode: 'IMAGE', numFaces: 3, outputFaceBlendshapes: true,
      });
    })().catch(e => { loading = null; throw e; });
  }
  return loading;
}

export async function initSegmenter() {
  await initVision();
  if (!segmenter) {
    segmenter = await mp.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: VENDOR + 'models/selfie_multiclass.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
  }
}

export async function initVideo() {
  await base();
  if (!videoLandmarker) {
    videoLandmarker = await create(mp.FaceLandmarker, {
      baseOptions: { modelAssetPath: VENDOR + 'models/face_landmarker.task' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
    });
  }
}

export function detectFaces(canvas) {
  const r = imageLandmarker.detect(canvas);
  return (r.faceLandmarks || []).map((lm, i) => ({
    landmarks: lm,
    blend: Object.fromEntries((r.faceBlendshapes?.[i]?.categories || []).map(c => [c.categoryName, c.score])),
  }));
}

export function detectVideo(video, ts) {
  if (!videoLandmarker) return null;
  const r = videoLandmarker.detectForVideo(video, ts);
  return r.faceLandmarks?.[0] || null;
}

// Liefert ein Canvas in Größe des Eingabebildes, Alpha = Person (Haare, Haut, Kleidung)
export function segmentPerson(canvas) {
  const r = segmenter.segment(canvas);
  try {
    const m = r.confidenceMasks[0]; // Kategorie 0 = Hintergrund
    const w = m.width, h = m.height;
    const bgConf = m.getAsFloat32Array();
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0, j = 0; i < bgConf.length; i++, j += 4) {
      d[j] = d[j + 1] = d[j + 2] = 255;
      d[j + 3] = Math.max(0, Math.min(255, (1 - bgConf[i]) * 255));
    }
    ctx.putImageData(img, 0, 0);
    return out;
  } finally {
    r.close?.();
  }
}
