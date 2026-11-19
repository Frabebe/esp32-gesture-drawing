import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

const statusElement = document.querySelector("#status");
const cameraImage = document.querySelector("#camera");
const cameraError = document.querySelector("#cameraError");
const streamInput = document.querySelector("#streamUrl");
const handsApi = window.Hands;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090d18);

const viewCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
viewCamera.position.set(0, 0, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.querySelector("#scene").appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223366, 2));
const grid = new THREE.GridHelper(12, 24, 0x31506c, 0x182739);
grid.position.z = -3;
scene.add(grid);

const cursorMaterial = new THREE.MeshStandardMaterial({ color: 0x32d7ff, emissive: 0x116688, emissiveIntensity: 1 });
const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), cursorMaterial);
scene.add(cursor);

const drawingGroup = new THREE.Group();
scene.add(drawingGroup);
const colors = [0x32d7ff, 0xff5f87, 0xffd166, 0x66efc4, 0xbd93f9];
let colorIndex = 0;
let activeLine = null;
let smoothedPoint = new THREE.Vector3();
let hasSmoothedPoint = false;
let lastTwoFinger = false;
let lastFist = false;
let hands;
let processingFrame = false;
let trackingEnabled = false;

function setStatus(message) {
  statusElement.textContent = message;
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerExtended(landmarks, tip, joint) {
  return landmarks[tip].y < landmarks[joint].y;
}

function isPinching(landmarks) {
  return distance2D(landmarks[4], landmarks[8]) < 0.055;
}

function isFist(landmarks) {
  const wrist = landmarks[0];
  return [8, 12, 16, 20].every((tip) =>
    distance2D(landmarks[tip], wrist) < distance2D(landmarks[tip - 2], wrist)
  );
}

function isTwoFingerGesture(landmarks) {
  return fingerExtended(landmarks, 8, 6) && fingerExtended(landmarks, 12, 10) &&
    !fingerExtended(landmarks, 16, 14) && !fingerExtended(landmarks, 20, 18);
}

function handToWorld(landmarks) {
  const index = landmarks[8];
  const x = (0.5 - index.x) * 6.4;
  const y = (0.5 - index.y) * 4.8;

  // Heuristic depth estimate based on apparent wrist-to-middle-knuckle size.
  const handScale = distance2D(landmarks[0], landmarks[9]);
  const normalized = THREE.MathUtils.clamp((handScale - 0.12) / (0.45 - 0.12), 0, 1);
  const z = THREE.MathUtils.lerp(2, -2.5, normalized);
  return new THREE.Vector3(x, y, z);
}

function addPoint(line, point) {
  line.userData.points.push(point.clone());
  line.geometry.setFromPoints(line.userData.points);
}

function beginLine() {
  const material = new THREE.LineBasicMaterial({ color: colors[colorIndex] });
  const line = new THREE.Line(new THREE.BufferGeometry(), material);
  line.userData.points = [];
  drawingGroup.add(line);
  return line;
}

function removeLine(line) {
  drawingGroup.remove(line);
  line.geometry.dispose();
  line.material.dispose();
}

function handleResults(results) {
  const landmarks = results.multiHandLandmarks?.[0];
  if (!landmarks) {
    activeLine = null;
    setStatus("Nessuna mano rilevata");
    return;
  }

  const target = handToWorld(landmarks);
  if (!hasSmoothedPoint) {
    smoothedPoint.copy(target);
    hasSmoothedPoint = true;
  } else {
    smoothedPoint.lerp(target, 0.28);
  }
  cursor.position.copy(smoothedPoint);

  const pinching = isPinching(landmarks);
  const fist = isFist(landmarks);
  const twoFinger = isTwoFingerGesture(landmarks);

  if (twoFinger && !lastTwoFinger) {
    colorIndex = (colorIndex + 1) % colors.length;
    cursorMaterial.color.setHex(colors[colorIndex]);
    cursorMaterial.emissive.setHex(colors[colorIndex]);
  }
  if (fist && !lastFist && drawingGroup.children.length) {
    removeLine(drawingGroup.children[drawingGroup.children.length - 1]);
  }

  if (pinching) {
    if (!activeLine) activeLine = beginLine();
    addPoint(activeLine, smoothedPoint);
    setStatus("Disegno in corso");
  } else {
    activeLine = null;
    setStatus(twoFinger ? "Colore selezionato" : fist ? "Ultimo tratto annullato" : "Mirino — pronto");
  }

  lastTwoFinger = twoFinger;
  lastFist = fist;
}

async function processFrames() {
  if (!trackingEnabled) return;
  if (cameraImage.complete && cameraImage.naturalWidth > 0 && !processingFrame) {
    processingFrame = true;
    try {
      await hands.send({ image: cameraImage });
    } catch (error) {
      console.error("MediaPipe frame error:", error);
      setStatus("Errore durante l'elaborazione del video; controlla la console.");
      trackingEnabled = false;
    } finally {
      processingFrame = false;
    }
  }
  if (trackingEnabled) requestAnimationFrame(processFrames);
}

function normalizeStreamUrl(rawValue) {
  const url = new URL(rawValue);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("L'URL deve iniziare con http:// o https://");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/stream")) url.pathname += "/stream";
  return url.toString();
}

document.querySelector("#connectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const streamUrl = normalizeStreamUrl(streamInput.value.trim());
    if (!handsApi) throw new Error("MediaPipe non è stato caricato. Controlla la connessione Internet.");
    trackingEnabled = false;
    cameraImage.src = "";
    cameraError.hidden = true;
    setStatus("Connessione allo stream…");

    if (!hands) {
      hands = new handsApi({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}` });
      hands.setOptions({
        selfieMode: true,
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });
      hands.onResults(handleResults);
    }

    cameraImage.onload = () => {
      trackingEnabled = true;
      setStatus("Camera connessa — mostra una mano");
      requestAnimationFrame(processFrames);
    };
    cameraImage.onerror = () => {
      cameraError.hidden = false;
      setStatus("Impossibile caricare lo stream: verifica IP e rete.");
    };
    cameraImage.src = streamUrl;
  } catch (error) {
    setStatus(error.message);
  }
});

document.querySelector("#clearButton").addEventListener("click", () => {
  for (const line of [...drawingGroup.children]) removeLine(line);
  activeLine = null;
  setStatus("Disegno cancellato");
});

window.addEventListener("resize", () => {
  viewCamera.aspect = window.innerWidth / window.innerHeight;
  viewCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, viewCamera);
}
animate();
