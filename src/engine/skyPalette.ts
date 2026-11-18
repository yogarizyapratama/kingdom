import { WeatherCondition } from '../simulation/types';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface SkyboxVisualState {
  phase: 'midnight' | 'sunrise' | 'midday' | 'sunset';
  horizonColor: RgbColor;
  zenithColor: RgbColor;
  horizonGlowColor: RgbColor;
  sunColor: RgbColor;
  sunLightColor: RgbColor;
  hemiSkyColor: RgbColor;
  hemiGroundColor: RgbColor;
  sunDir: { x: number; y: number; z: number };
  sunElevation: number;
  sunIntensity: number;
  hemiIntensity: number;
  starVisibility: number;
  skyRotationY: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
  const k = clamp01(t);
  return {
    r: lerp(a.r, b.r, k),
    g: lerp(a.g, b.g, k),
    b: lerp(a.b, b.b, k),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

interface PaletteStop {
  t: number;
  horizon: RgbColor;
  zenith: RgbColor;
  glow: RgbColor;
  sun: RgbColor;
  sunLight: RgbColor;
  hemiSky: RgbColor;
  hemiGround: RgbColor;
}

// 0.00 Midnight -> 0.25 Golden Sunrise -> 0.50 Bright Midday -> 0.75 Fiery Sunset -> 1.00 Midnight
const SKY_STOPS: PaletteStop[] = [
  {
    t: 0.0, // Starry Midnight
    horizon: { r: 0.055, g: 0.085, b: 0.175 },
    zenith: { r: 0.014, g: 0.028, b: 0.085 },
    glow: { r: 0.10, g: 0.16, b: 0.30 },
    sun: { r: 0.78, g: 0.85, b: 1.0 },
    sunLight: { r: 0.56, g: 0.68, b: 0.92 },
    hemiSky: { r: 0.20, g: 0.28, b: 0.48 },
    hemiGround: { r: 0.10, g: 0.11, b: 0.14 },
  },
  {
    t: 0.16, // Pre-dawn Twilight
    horizon: { r: 0.36, g: 0.28, b: 0.42 },
    zenith: { r: 0.06, g: 0.11, b: 0.26 },
    glow: { r: 0.65, g: 0.42, b: 0.35 },
    sun: { r: 0.98, g: 0.68, b: 0.40 },
    sunLight: { r: 0.82, g: 0.64, b: 0.52 },
    hemiSky: { r: 0.42, g: 0.38, b: 0.55 },
    hemiGround: { r: 0.20, g: 0.18, b: 0.18 },
  },
  {
    t: 0.25, // Golden Sunrise
    horizon: { r: 0.99, g: 0.74, b: 0.36 },
    zenith: { r: 0.24, g: 0.46, b: 0.74 },
    glow: { r: 1.0, g: 0.82, b: 0.42 },
    sun: { r: 1.0, g: 0.88, b: 0.54 },
    sunLight: { r: 1.0, g: 0.84, b: 0.58 },
    hemiSky: { r: 0.82, g: 0.76, b: 0.74 },
    hemiGround: { r: 0.34, g: 0.29, b: 0.20 },
  },
  {
    t: 0.36, // Crisp Morning
    horizon: { r: 0.71, g: 0.86, b: 0.95 },
    zenith: { r: 0.20, g: 0.49, b: 0.82 },
    glow: { r: 0.92, g: 0.93, b: 0.85 },
    sun: { r: 1.0, g: 0.96, b: 0.84 },
    sunLight: { r: 1.0, g: 0.95, b: 0.85 },
    hemiSky: { r: 0.68, g: 0.84, b: 0.95 },
    hemiGround: { r: 0.30, g: 0.27, b: 0.20 },
  },
  {
    t: 0.5, // Bright Midday
    horizon: { r: 0.66, g: 0.86, b: 0.97 },
    zenith: { r: 0.15, g: 0.44, b: 0.84 },
    glow: { r: 0.88, g: 0.95, b: 1.0 },
    sun: { r: 1.0, g: 0.98, b: 0.90 },
    sunLight: { r: 1.0, g: 0.97, b: 0.90 },
    hemiSky: { r: 0.70, g: 0.87, b: 0.98 },
    hemiGround: { r: 0.33, g: 0.30, b: 0.22 },
  },
  {
    t: 0.64, // Late Afternoon
    horizon: { r: 0.78, g: 0.82, b: 0.86 },
    zenith: { r: 0.21, g: 0.44, b: 0.75 },
    glow: { r: 0.98, g: 0.78, b: 0.56 },
    sun: { r: 1.0, g: 0.86, b: 0.62 },
    sunLight: { r: 1.0, g: 0.88, b: 0.68 },
    hemiSky: { r: 0.72, g: 0.77, b: 0.85 },
    hemiGround: { r: 0.31, g: 0.26, b: 0.20 },
  },
  {
    t: 0.75, // Fiery Sunset
    horizon: { r: 0.96, g: 0.36, b: 0.18 },
    zenith: { r: 0.21, g: 0.14, b: 0.38 },
    glow: { r: 1.0, g: 0.45, b: 0.16 },
    sun: { r: 1.0, g: 0.48, b: 0.20 },
    sunLight: { r: 1.0, g: 0.56, b: 0.34 },
    hemiSky: { r: 0.68, g: 0.40, b: 0.46 },
    hemiGround: { r: 0.26, g: 0.17, b: 0.16 },
  },
  {
    t: 0.84, // Deep Dusk
    horizon: { r: 0.34, g: 0.17, b: 0.31 },
    zenith: { r: 0.05, g: 0.06, b: 0.18 },
    glow: { r: 0.64, g: 0.24, b: 0.28 },
    sun: { r: 0.95, g: 0.38, b: 0.24 },
    sunLight: { r: 0.62, g: 0.46, b: 0.62 },
    hemiSky: { r: 0.28, g: 0.22, b: 0.40 },
    hemiGround: { r: 0.13, g: 0.11, b: 0.14 },
  },
  {
    t: 1.0, // Back to Starry Midnight
    horizon: { r: 0.055, g: 0.085, b: 0.175 },
    zenith: { r: 0.014, g: 0.028, b: 0.085 },
    glow: { r: 0.10, g: 0.16, b: 0.30 },
    sun: { r: 0.78, g: 0.85, b: 1.0 },
    sunLight: { r: 0.56, g: 0.68, b: 0.92 },
    hemiSky: { r: 0.20, g: 0.28, b: 0.48 },
    hemiGround: { r: 0.10, g: 0.11, b: 0.14 },
  },
];

export function computeSkyboxState(
  timeOfDay: number,
  _weather: WeatherCondition,
  rainFactor: number,
  fogFactor: number,
  elapsedSeconds = 0,
): SkyboxVisualState {
  const t = ((timeOfDay % 1) + 1) % 1;

  let prev = SKY_STOPS[0];
  let next = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (t >= SKY_STOPS[i].t && t <= SKY_STOPS[i + 1].t) {
      prev = SKY_STOPS[i];
      next = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, next.t - prev.t);
  const localT = smoothstep(0, 1, (t - prev.t) / span);

  let horizonColor = lerpRgb(prev.horizon, next.horizon, localT);
  let zenithColor = lerpRgb(prev.zenith, next.zenith, localT);
  let horizonGlowColor = lerpRgb(prev.glow, next.glow, localT);
  const sunColor = lerpRgb(prev.sun, next.sun, localT);
  const sunLightColor = lerpRgb(prev.sunLight, next.sunLight, localT);
  const hemiSkyColor = lerpRgb(prev.hemiSky, next.hemiSky, localT);
  const hemiGroundColor = lerpRgb(prev.hemiGround, next.hemiGround, localT);

  // Sun travels from East (+X at dawn 0.25) -> Zenith (noon 0.50) -> West (-X at sunset 0.75)
  const sunAngle = (t - 0.25) * Math.PI * 2;
  const sunElevation = Math.sin(sunAngle);
  const rawX = Math.cos(sunAngle);
  const rawY = sunElevation;
  const rawZ = -0.34;
  const len = Math.hypot(rawX, rawY, rawZ) || 1;
  const sunDir = { x: rawX / len, y: rawY / len, z: rawZ / len };

  const daylightWeight = Math.max(0.28, Math.min(1, (sunElevation + 0.25) / 0.65));

  if (rainFactor > 0.005) {
    const m = rainFactor * 0.82;
    const rainHoriz = { r: 0.34 * daylightWeight, g: 0.41 * daylightWeight, b: 0.49 * daylightWeight };
    const rainZen = { r: 0.20 * daylightWeight, g: 0.26 * daylightWeight, b: 0.34 * daylightWeight };
    horizonColor = lerpRgb(horizonColor, rainHoriz, m);
    zenithColor = lerpRgb(zenithColor, rainZen, m);
    horizonGlowColor = lerpRgb(horizonGlowColor, rainHoriz, m);
  }
  if (fogFactor > 0.005) {
    const m = fogFactor * 0.88;
    const fogHoriz = { r: 0.72 * daylightWeight, g: 0.77 * daylightWeight, b: 0.79 * daylightWeight };
    const fogZen = { r: 0.58 * daylightWeight, g: 0.64 * daylightWeight, b: 0.68 * daylightWeight };
    horizonColor = lerpRgb(horizonColor, fogHoriz, m);
    zenithColor = lerpRgb(zenithColor, fogZen, m);
    horizonGlowColor = lerpRgb(horizonGlowColor, fogHoriz, m);
  }

  const sunWeatherScale = 1 - rainFactor * 0.52 - fogFactor * 0.48;
  const hemiWeatherScale = 1 - rainFactor * 0.16 - fogFactor * 0.05;
  const sunIntensity =
    (sunElevation > 0 ? 0.95 + sunElevation * 1.15 : 0.26) * sunWeatherScale;
  const hemiIntensity = (sunElevation > -0.05 ? 0.74 : 0.28) * hemiWeatherScale;

  const starVisibility =
    smoothstep(-0.02, -0.26, sunElevation) * (1 - rainFactor * 0.88) * (1 - fogFactor * 0.82);

  // Continuous celestial dome rotation synced with day-night cycle + subtle drift
  const skyRotationY = t * Math.PI * 2 + elapsedSeconds * 0.006;

  let phase: SkyboxVisualState['phase'] = 'midday';
  if (t >= 0.18 && t < 0.33) phase = 'sunrise';
  else if (t >= 0.67 && t < 0.83) phase = 'sunset';
  else if (t >= 0.83 || t < 0.18) phase = 'midnight';

  return {
    phase,
    horizonColor,
    zenithColor,
    horizonGlowColor,
    sunColor,
    sunLightColor,
    hemiSkyColor,
    hemiGroundColor,
    sunDir,
    sunElevation,
    sunIntensity,
    hemiIntensity,
    starVisibility,
    skyRotationY,
  };
}
