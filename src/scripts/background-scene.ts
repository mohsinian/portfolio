import * as THREE from "three";

/**
 * "Follow the Request" — monorail edition.
 *
 * A single elevated rail runs through eight stations (CLIENT → LOAD
 * BALANCER → API GATEWAY → AUTH → SERVICES → QUEUE → CACHE → DATABASE).
 * Scroll position drives a glowing data-packet train — a locomotive plus
 * three cars — along the rail; the camera chases it. The station the train
 * is currently in lights blue (fascia strip + lamp), stations it has passed
 * switch to green, and near the page bottom the whole train turns green —
 * the 200 OK arriving.
 *
 * Colors are read from the site's CSS variables, so the scene follows the
 * dark/light theme toggle automatically.
 *
 * prefers-reduced-motion selects "calm mode": the train still follows
 * scrolling (user-initiated motion), but ambient drift and mouse parallax
 * are dropped.
 */

interface Stage {
  label: string;
  pos: THREE.Vector3;
}

const STAGES: Stage[] = [
  { label: "CLIENT", pos: new THREE.Vector3(-22, 0, 2.2) },
  { label: "LOAD BALANCER", pos: new THREE.Vector3(-15.5, 0, -1.4) },
  { label: "API GATEWAY", pos: new THREE.Vector3(-9.5, 0, 1.8) },
  { label: "AUTH", pos: new THREE.Vector3(-3.5, 0, -1.8) },
  { label: "SERVICES", pos: new THREE.Vector3(2.5, 0, 1.6) },
  { label: "QUEUE", pos: new THREE.Vector3(8.5, 0, -1.6) },
  { label: "CACHE", pos: new THREE.Vector3(14.5, 0, 1.8) },
  { label: "DATABASE", pos: new THREE.Vector3(21, 0, -1.8) },
];

const GREEN = new THREE.Color("#34d399");
const AMBER = new THREE.Color("#f59e0b");
const LAMP_IDLE_DARK = new THREE.Color("#475569");
const LAMP_IDLE_LIGHT = new THREE.Color("#94a3b8");

// Soft round sprite texture, reused for the train's glow and energy trail.
function makeDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.7)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Enamel station sign, re-rendered on theme change.
function makeLabelSprite(text: string, dark: boolean, height: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = "bold 54px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth) + 90;
  canvas.height = 96;
  ctx.fillStyle = dark ? "#0b1322" : "#f8fafc";
  ctx.strokeStyle = dark ? "#3f5378" : "#94a3b8";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 12);
  ctx.fill();
  ctx.stroke();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dark ? "#dbe7ff" : "#0f172a";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1000;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(height * aspect, height, 1);
  return { sprite, material };
}

function abbreviateRole(role: string): string {
  const normalized = role.trim().toUpperCase();
  const level = normalized.match(/\bL[0-9]+\b/)?.[0] ?? "";

  if (normalized.includes("JUNIOR SOFTWARE ENGINEER")) return `JSE${level ? ` ${level}` : ""}`;
  if (normalized.includes("TRAINEE SOFTWARE ENGINEER")) return `TSE${level ? ` ${level}` : ""}`;
  if (normalized.includes("SOFTWARE ENGINEER")) return `SE${level ? ` ${level}` : ""}`;

  return normalized;
}

function getExperienceLabel(article: HTMLElement, index: number): string {
  const company =
    article.querySelector("h3 a")?.textContent?.trim().toUpperCase() ?? `STOP ${index + 1}`;
  const role = abbreviateRole(article.querySelector("p.text-accent")?.textContent ?? "");
  return role ? `${company} · ${role}` : company;
}

// A gear: disc + teeth + hub, spinning around its own Y axis.
function makeGear(radius: number, material: THREE.Material): THREE.Group {
  const gear = new THREE.Group();
  gear.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.16, 20), material));
  const tooth = new THREE.BoxGeometry(radius * 0.36, 0.16, radius * 0.3);
  const count = Math.max(8, Math.round(radius * 10));
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(tooth, material);
    const angle = (i / count) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    mesh.rotation.y = -angle;
    gear.add(mesh);
  }
  gear.add(
    new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.3, 12), material),
  );
  return gear;
}

export function mountBackgroundScene(canvas: HTMLCanvasElement): void {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 767px)").matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    canvas.remove(); // no WebGL — page works fine without the scene
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0f172a, 0.026);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 140);
  const world = new THREE.Group();
  scene.add(world);

  // ── Lighting ────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const dir = new THREE.DirectionalLight(0xbfdbfe, 0.9);
  dir.position.set(6, 12, 8);
  const headlight = new THREE.PointLight(0x60a5fa, 30, 13, 2);
  scene.add(ambient, dir, headlight);

  const dot = makeDotTexture();

  const steel = new THREE.MeshStandardMaterial({ color: 0x52617a, metalness: 0.75, roughness: 0.42 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e3a4f, metalness: 0.6, roughness: 0.6 });

  // ── Ground grid ─────────────────────────────────────────────────────────
  let floor: THREE.GridHelper | null = null;
  function buildFloor(dark: boolean) {
    if (floor) {
      world.remove(floor);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
    }
    floor = new THREE.GridHelper(100, 50, dark ? 0x33507a : 0xb7c4d6, dark ? 0x1c2a40 : 0xdbe3ec);
    floor.position.y = -1.6;
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = dark ? 0.5 : 0.8;
    world.add(floor);
  }

  // ── The rail ────────────────────────────────────────────────────────────
  const path = new THREE.CatmullRomCurve3(STAGES.map((s) => s.pos), false, "catmullrom", 0.35);
  const pathLength = path.getLength();

  world.add(new THREE.Mesh(new THREE.TubeGeometry(path, 200, 0.12, 8, false), steel));

  // Pylons holding the rail up.
  const PYLON_COUNT = mobile ? 10 : 15;
  const pylonGeometry = new THREE.BoxGeometry(0.16, 1.66, 0.16);
  const pylonFoot = new THREE.BoxGeometry(0.5, 0.12, 0.5);
  for (let i = 0; i < PYLON_COUNT; i++) {
    const t = (i + 0.5) / PYLON_COUNT;
    const point = path.getPointAt(t);
    const pylon = new THREE.Mesh(pylonGeometry, iron);
    pylon.position.set(point.x, -0.83, point.z);
    world.add(pylon);
    const foot = new THREE.Mesh(pylonFoot, iron);
    foot.position.set(point.x, -1.56, point.z);
    world.add(foot);
  }

  // ── Stations: columns + canopy + fascia strip + lamp + sign ─────────────
  interface Station {
    lampMaterial: THREE.MeshBasicMaterial;
    fasciaMaterial: THREE.MeshBasicMaterial;
    label: THREE.Sprite;
    labelMaterial: THREE.SpriteMaterial;
  }

  const stations: Station[] = STAGES.map((stage, i) => {
    const group = new THREE.Group();
    group.position.copy(stage.pos);
    const tangent = path.getTangentAt(i / (STAGES.length - 1));
    group.lookAt(stage.pos.clone().add(tangent));

    const columnGeo = new THREE.BoxGeometry(0.28, 3.7, 0.28);
    for (const side of [-1.55, 1.55]) {
      const column = new THREE.Mesh(columnGeo, steel);
      column.position.set(side, 0.25, 0);
      group.add(column);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 1.5), steel);
    roof.position.y = 2.2;
    group.add(roof);

    // Fascia strip on the leading edge — the station's light line.
    const fasciaMaterial = new THREE.MeshBasicMaterial({ color: 0x334155 });
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 0.04), fasciaMaterial);
    fascia.position.set(0, 2.11, 0.76);
    group.add(fascia);

    const lampMaterial = new THREE.MeshBasicMaterial({ color: 0x475569 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), lampMaterial);
    lamp.position.set(1.7, 2.42, 0);
    group.add(lamp);

    const label = makeLabelSprite(stage.label, true, mobile ? 0.5 : 0.58);
    label.sprite.position.y = 3.0;
    group.add(label.sprite);

    world.add(group);
    return { lampMaterial, fasciaMaterial, label: label.sprite, labelMaterial: label.material };
  });

  const contentPanels = Array.from(document.querySelectorAll<HTMLElement>(".machine-panel"));
  const labelWorldPosition = new THREE.Vector3();
  const labelWorldScale = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const projectedLabel = new THREE.Vector3();

  function keepStationLabelsClear() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const visiblePanels = contentPanels
      .map((panel) => panel.getBoundingClientRect())
      .filter((rect) => rect.bottom > 0 && rect.top < viewportHeight);

    camera.updateMatrixWorld();
    world.updateMatrixWorld(true);
    camera.getWorldDirection(cameraDirection);

    for (const station of stations) {
      const label = station.label;
      label.visible = true;
      label.position.y = 3;
      label.updateWorldMatrix(true, false);
      label.getWorldPosition(labelWorldPosition);
      label.getWorldScale(labelWorldScale);

      const cameraDepth = labelWorldPosition.clone().sub(camera.position).dot(cameraDirection);
      if (cameraDepth <= 0) continue;

      projectedLabel.copy(labelWorldPosition).project(camera);
      const centerX = (projectedLabel.x * 0.5 + 0.5) * viewportWidth;
      const centerY = (-projectedLabel.y * 0.5 + 0.5) * viewportHeight;
      const pixelsPerWorldUnit =
        viewportHeight /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * cameraDepth);
      const halfWidth = (labelWorldScale.x * pixelsPerWorldUnit) / 2;
      const halfHeight = (labelWorldScale.y * pixelsPerWorldUnit) / 2;
      const clearance = 10;

      const blockedRanges = visiblePanels
        .filter(
          (rect) =>
            centerX + halfWidth > rect.left - clearance &&
            centerX - halfWidth < rect.right + clearance,
        )
        .map((rect) => ({
          start: rect.top - clearance - halfHeight,
          end: rect.bottom + clearance + halfHeight,
        }));

      const isBlocked = (y: number) =>
        blockedRanges.some((range) => y > range.start && y < range.end);
      if (!isBlocked(centerY)) continue;

      const minCenterY = 76 + halfHeight;
      const maxCenterY = viewportHeight - clearance - halfHeight;
      const candidates = blockedRanges
        .flatMap((range) => [range.start, range.end])
        .filter(
          (candidate) =>
            candidate >= minCenterY && candidate <= maxCenterY && !isBlocked(candidate),
        )
        .sort((a, b) => Math.abs(a - centerY) - Math.abs(b - centerY));
      const clearCenterY = candidates[0];
      if (clearCenterY === undefined) {
        label.visible = false;
        continue;
      }

      label.visible = true;
      const targetY = 3 - (clearCenterY - centerY) / pixelsPerWorldUnit;
      label.position.y = THREE.MathUtils.clamp(targetY, 1.8, 4.4);
    }
  }

  // ── Background scenery: half-sunk depot gears + pipework ────────────────
  const bgGears: { mesh: THREE.Group; speed: number }[] = [];
  const gearSpots: [number, number][] = mobile
    ? [[-14, -6], [4, -7], [16, -6]]
    : [[-18, -7], [-8, -8.5], [2, -7], [11, -8.5], [20, -7]];
  for (const [x, z] of gearSpots) {
    const radius = 1.6 + Math.random() * 1.4;
    const gear = makeGear(radius, iron);
    gear.position.set(x, -1.6 + radius * 0.55, z);
    world.add(gear);
    bgGears.push({ mesh: gear, speed: (Math.random() > 0.5 ? 1 : -1) * (0.1 + Math.random() * 0.15) });
  }

  const pipeZ = mobile ? [-5.5, -7.5] : [-5.5, -7, -8.5];
  const pipeY = [1.1, 2.3, 0.3];
  pipeZ.forEach((z, idx) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 56, 10), steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, pipeY[idx], z);
    world.add(pipe);
    for (let x = -24; x <= 24; x += 8) {
      const flange = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16), iron);
      flange.rotation.y = Math.PI / 2;
      flange.position.set(x, pipeY[idx], z);
      world.add(flange);
    }
  });

  // ── The data-packet train: locomotive + three cars ──────────────────────
  const trainGroup = new THREE.Group();
  world.add(trainGroup);

  interface TrainSegment {
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    offset: number; // arc-length offset behind the locomotive
  }

  const segmentDefs: { size: [number, number, number]; offset: number; emissive: number }[] = [
    { size: [0.6, 0.55, 1.0], offset: 0, emissive: 0.65 }, // locomotive
    { size: [0.55, 0.48, 0.75], offset: -1.15, emissive: 0.5 },
    { size: [0.55, 0.48, 0.75], offset: -2.1, emissive: 0.45 },
    { size: [0.55, 0.48, 0.75], offset: -3.05, emissive: 0.4 },
  ];
  const train: TrainSegment[] = segmentDefs.map((def, i) => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.35,
      roughness: 0.4,
      emissive: 0x1d4ed8,
      emissiveIntensity: def.emissive,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.size), material);
    trainGroup.add(mesh);
    if (i === 0) {
      // locomotive cab hump
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), material);
      cab.position.set(0, 0.36, -0.15);
      mesh.add(cab);
    }
    return { mesh, material, offset: def.offset / pathLength };
  });

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: dot, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  glow.scale.setScalar(2.4);
  world.add(glow);

  // Amber energy trail behind the locomotive.
  const TRAIL = 22;
  const trailGeometry = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(TRAIL * 3);
  const trailColors = new Float32Array(TRAIL * 3);
  for (let i = 0; i < TRAIL; i++) {
    AMBER.clone().multiplyScalar(Math.pow(1 - i / TRAIL, 2) * 0.9).toArray(trailColors, i * 3);
  }
  trailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute("color", new THREE.Float32BufferAttribute(trailColors, 3));
  const trailMaterial = new THREE.PointsMaterial({
    size: 0.3,
    map: dot,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  world.add(new THREE.Points(trailGeometry, trailMaterial));
  const trailHistory: THREE.Vector3[] = Array.from({ length: TRAIL }, () => path.getPointAt(0).clone());

  // ── Theme ───────────────────────────────────────────────────────────────
  const accentLightColor = new THREE.Color("#60a5fa");
  function applyTheme() {
    const dark = document.documentElement.classList.contains("dark");
    const styles = getComputedStyle(document.documentElement);
    accentLightColor.set(styles.getPropertyValue("--color-accent-light").trim() || "#60a5fa");
    (scene.fog as THREE.FogExp2).color.set(
      styles.getPropertyValue("--color-bg").trim() || (dark ? "#0f172a" : "#ffffff"),
    );
    (scene.fog as THREE.FogExp2).density = dark ? 0.026 : 0.034;
    ambient.intensity = dark ? 0.45 : 1.1;
    dir.intensity = dark ? 0.9 : 1.6;
    // In light mode the line recedes to a faint backdrop so text stays readable.
    canvas.style.opacity = dark ? "1" : "0.4";
    steel.color.set(dark ? 0x52617a : 0x9fb0c6);
    iron.color.set(dark ? 0x2e3a4f : 0x74879e);
    headlight.color.copy(accentLightColor);
    (glow.material as THREE.SpriteMaterial).color.copy(accentLightColor);
    (glow.material as THREE.SpriteMaterial).opacity = dark ? 0.4 : 0.2;
    buildFloor(dark);
    stations.forEach((station, i) => {
      const label = makeLabelSprite(STAGES[i].label, dark, mobile ? 0.5 : 0.58);
      station.labelMaterial.map?.dispose();
      station.labelMaterial.dispose();
      station.labelMaterial.copy(label.material);
      station.labelMaterial.map = label.material.map;
    });
    destinations.forEach((dest, i) => {
      const article = experienceArticles[i];
      if (!article) return;
      const label = makeLabelSprite(getExperienceLabel(article, i), dark, 1);
      dest.plateMaterial.map?.dispose();
      dest.plateMaterial.dispose();
      dest.plateMaterial.copy(label.material);
      dest.plateMaterial.map = label.material.map;
      dest.plateMaterial.fog = false;
      dest.plateAspect = label.sprite.scale.x;
    });
    render();
  }
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // ── Input state ─────────────────────────────────────────────────────────
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  if (!mobile && !calm) {
    window.addEventListener("pointermove", (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    });
  }

  let scrollProgress = 0;
  window.addEventListener(
    "scroll",
    () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = scrollable > 0 ? window.scrollY / scrollable : 0;
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
  });

  // ── Loop ────────────────────────────────────────────────────────────────
  let easedP = 0;
  let expZoom = 0;
  let lastTime = performance.now();
  // Watch the line from a distance — a model-railway viewpoint.
  const camBack = mobile ? 14 : 12.5;
  const camUp = mobile ? 5.6 : 5.2;
  const ahead = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const segPos = new THREE.Vector3();
  const segAim = new THREE.Vector3();
  const trainHead = new THREE.Vector3();
  const experienceSection = document.getElementById("experience");
  const experienceArticles = Array.from(
    document.querySelectorAll<HTMLElement>("#experience article"),
  );
  const idleLamp = () =>
    document.documentElement.classList.contains("dark") ? LAMP_IDLE_DARK : LAMP_IDLE_LIGHT;

  // ── Experience destinations: glowing stops IN the monorail world ───────
  // Real 3D objects planted beside the line, projected each frame so each
  // one lands in the left/right screen gutter at its article's height —
  // glowing ball, sign plate, and a pole rooted in the factory floor.
  interface Destination {
    ball: THREE.Mesh;
    ballMaterial: THREE.MeshBasicMaterial;
    halo: THREE.Sprite;
    haloMaterial: THREE.SpriteMaterial;
    plate: THREE.Sprite;
    plateMaterial: THREE.SpriteMaterial;
    plateAspect: number;
    pole: THREE.Mesh;
    poleMaterial: THREE.MeshBasicMaterial;
    side: number;
  }

  const destRaycaster = new THREE.Raycaster();
  const destNdc = new THREE.Vector2();
  const destPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35); // y = 0.35
  const destHit = new THREE.Vector3();
  const UP_AXIS = new THREE.Vector3(0, 1, 0);

  const destinations: Destination[] = experienceArticles.map((article, i) => {
    const text = getExperienceLabel(article, i);

    const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x60a5fa, fog: false });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), ballMaterial);

    const haloMaterial = new THREE.SpriteMaterial({
      map: dot,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMaterial);

    const plateLabel = makeLabelSprite(text, true, 1);
    const plate = plateLabel.sprite;
    const plateMaterial = plateLabel.material;
    plateMaterial.fog = false;

    const poleMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.5,
      fog: false,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), poleMaterial);

    world.add(ball, halo, plate, pole);
    ball.visible = halo.visible = plate.visible = pole.visible = false;
    return {
      ball,
      ballMaterial,
      halo,
      haloMaterial,
      plate,
      plateMaterial,
      plateAspect: plate.scale.x,
      pole,
      poleMaterial,
      side: i % 2 === 0 ? -1 : 1, // left, right, left
    };
  });

  function render() {
    renderer.render(scene, camera);
  }

  applyTheme();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const time = now / 1000;
    const ambientSpeed = calm ? 0.35 : 1;

    easedP += (scrollProgress - easedP) * (calm ? 0.03 : 0.06);
    const p = THREE.MathUtils.clamp(easedP, 0, 1);
    const response = p > 0.92; // the 200 OK moment near the page bottom

    // Train segments ride the rail, each oriented along the track.
    for (const segment of train) {
      const t = THREE.MathUtils.clamp(p + segment.offset, 0, 1);
      path.getPointAt(t, segPos);
      segPos.y += 0.42;
      segment.mesh.position.copy(segPos);
      path.getTangentAt(t, tangent);
      segAim.copy(segPos).add(tangent);
      segment.mesh.lookAt(segAim);
      if (response) {
        segment.material.color.lerp(GREEN, 0.04);
        segment.material.emissive.lerp(GREEN, 0.04);
      }
    }
    path.getPointAt(p, trainHead);
    trainHead.y += 0.42;
    glow.position.copy(trainHead);
    headlight.position.copy(trainHead).addScaledVector(tangent, 1.8).add(new THREE.Vector3(0, 0.4, 0));

    trailHistory.pop();
    trailHistory.unshift(trainHead.clone());
    trailHistory.forEach((point, i) => trailPositions.set([point.x, point.y, point.z], i * 3));
    trailGeometry.attributes.position.needsUpdate = true;

    // Stations: the one the train is in lights blue, passed ones green.
    const active = Math.round(p * (STAGES.length - 1));
    for (let i = 0; i < stations.length; i++) {
      const state = i < active ? "passed" : i === active ? "active" : "idle";
      const station = stations[i];
      const target = state === "passed" ? GREEN : state === "active" ? accentLightColor : idleLamp();
      station.lampMaterial.color.lerp(target, 0.12);
      station.fasciaMaterial.color.lerp(target, 0.1);
      station.labelMaterial.opacity += ((state === "idle" ? 0.55 : 1) - station.labelMaterial.opacity) * 0.08;
    }

    for (const gear of bgGears) {
      gear.mesh.rotation.y += dt * gear.speed * ambientSpeed;
    }

    // Experience overview: while the section is in view, rise into a
    // bird's-eye view of the serpentine so the line sweeps through the
    // side gutters; the destination stops themselves live in the DOM,
    // anchored beside their cards (see Experience.astro).
    let sectionVis = 0;
    if (experienceSection) {
      const rect = experienceSection.getBoundingClientRect();
      const overlap = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      sectionVis = overlap > 0 ? Math.min(1, overlap / (window.innerHeight * 0.4)) : 0;
    }

    // Camera chases a point slightly behind the locomotive.
    expZoom += (sectionVis - expZoom) * 0.05;
    const camP = THREE.MathUtils.clamp(p - 0.035, 0, 1);
    path.getPointAt(camP, ahead);
    path.getTangentAt(camP, tangent);
    if (!calm) {
      eased.x += (pointer.x - eased.x) * 0.04;
      eased.y += (pointer.y - eased.y) * 0.04;
    }
    camPos.copy(ahead).addScaledVector(tangent, -camBack * (1 + expZoom * 0.9));
    camPos.y = camUp * (1 + expZoom * 1.1) + eased.y * 0.5;
    camPos.x += eased.x * 0.7;
    camera.position.copy(camPos);
    lookTarget.copy(ahead).addScaledVector(tangent, 5 + expZoom * 4);
    lookTarget.y += 0.8 - expZoom * 1.4;
    camera.lookAt(lookTarget);

    // Destinations: ray-project the gutter point at each article's height
    // into the world and plant the glowing stop exactly there.
    let nearestArticle = -1;
    if (sectionVis > 0 && experienceArticles.length > 0) {
      let nearestDist = Infinity;
      experienceArticles.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const dist = Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestArticle = i;
        }
      });
    }
    destinations.forEach((dest, i) => {
      const article = experienceArticles[i];
      if (!article) return;
      const r = article.getBoundingClientRect();
      const centerY = (r.top + r.bottom) / 2;
      const vis = Math.max(0, 1 - Math.abs(centerY - window.innerHeight / 2) / (window.innerHeight * 0.6));
      const show = vis > 0.02;
      dest.ball.visible = dest.halo.visible = dest.plate.visible = dest.pole.visible = show;
      if (!show) return;

      const ndcY = THREE.MathUtils.clamp(1 - (2 * centerY) / window.innerHeight, -0.72, 0.72);
      destNdc.set(dest.side * (mobile ? 0.52 : 0.74), ndcY);
      destRaycaster.setFromCamera(destNdc, camera);
      if (!destRaycaster.ray.intersectPlane(destPlane, destHit)) return;

      const dist = camera.position.distanceTo(destHit);
      const active = i === nearestArticle;
      const passed = nearestArticle > i;
      const colorTarget = passed ? GREEN : accentLightColor;

      dest.ball.position.copy(destHit);
      dest.ball.scale.setScalar(dist * 0.02);
      dest.ballMaterial.color.lerp(colorTarget, 0.1);

      const pulse = 1 + Math.sin(time * (active ? 5 : 2.2) + i * 1.3) * 0.18;
      dest.halo.position.copy(destHit);
      dest.halo.scale.setScalar(dist * 0.16 * pulse);
      dest.haloMaterial.opacity = vis * (active ? 0.95 : 0.55);
      dest.haloMaterial.color.lerp(colorTarget, 0.1);

      const naturalPlateHeight = dist * 0.038;
      const naturalPlateWidth = dest.plateAspect * naturalPlateHeight;
      const viewportWorldWidth =
        2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
      const maxPlateWidth = viewportWorldWidth * (mobile ? 0.42 : 0.22);
      const plateWidth = Math.min(naturalPlateWidth, maxPlateWidth);
      const plateHeight = plateWidth / dest.plateAspect;
      dest.plate.position.copy(destHit).addScaledVector(UP_AXIS, -plateHeight * 2.1);
      dest.plate.scale.set(plateWidth, plateHeight, 1);
      dest.plateMaterial.opacity = vis * (active ? 1 : 0.7);

      const poleTop = destHit.y;
      const poleBottom = -1.6;
      const poleLength = Math.max(poleTop - poleBottom, 0.01);
      dest.pole.scale.set(1, poleLength, 1);
      dest.pole.position.set(destHit.x, poleBottom + poleLength / 2, destHit.z);
      dest.poleMaterial.opacity = vis * 0.5;
      dest.poleMaterial.color.lerp(colorTarget, 0.1);
    });

    keepStationLabelsClear();
    render();
  });
}
