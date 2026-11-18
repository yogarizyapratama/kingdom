import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSkyboxState } from './skyPalette';

test('skybox transitions through golden sunrise, bright midday, fiery sunset, and starry midnight', () => {
  const sunrise = computeSkyboxState(0.25, 'sunny', 0, 0, 0);
  assert.equal(sunrise.phase, 'sunrise');
  // Golden sunrise: warm golden-amber horizon (high R & G, lower B)
  assert.ok(sunrise.horizonColor.r > 0.9);
  assert.ok(sunrise.horizonColor.g > 0.65);
  assert.ok(sunrise.horizonColor.r > sunrise.horizonColor.b);
  assert.ok(sunrise.starVisibility < 0.25);

  const midday = computeSkyboxState(0.5, 'sunny', 0, 0, 10);
  assert.equal(midday.phase, 'midday');
  // Bright midday: blue-dominant bright sky, peak sun elevation
  assert.ok(midday.horizonColor.b > midday.horizonColor.r);
  assert.ok(midday.zenithColor.b > midday.zenithColor.r);
  assert.ok(midday.sunElevation > 0.9);
  assert.equal(midday.starVisibility, 0);

  const sunset = computeSkyboxState(0.75, 'sunny', 0, 0, 20);
  assert.equal(sunset.phase, 'sunset');
  // Fiery sunset: crimson-orange horizon (R much higher than G & B), purple-indigo zenith
  assert.ok(sunset.horizonColor.r > 0.9);
  assert.ok(sunset.horizonColor.r > sunset.horizonColor.g * 2);
  assert.ok(sunset.zenithColor.b > sunset.zenithColor.g);

  const midnight = computeSkyboxState(0.0, 'sunny', 0, 0, 30);
  assert.equal(midnight.phase, 'midnight');
  // Starry midnight: dark navy sky, full star visibility
  assert.ok(midnight.zenithColor.b < 0.12);
  assert.ok(midnight.zenithColor.r < 0.05);
  assert.ok(midnight.starVisibility > 0.95);
});

test('skybox rotates continuously across the day-night cycle and dims stars during rain/fog', () => {
  const morning = computeSkyboxState(0.25, 'sunny', 0, 0, 0);
  const noon = computeSkyboxState(0.5, 'sunny', 0, 0, 0);
  const evening = computeSkyboxState(0.75, 'sunny', 0, 0, 0);
  assert.ok(noon.skyRotationY > morning.skyRotationY);
  assert.ok(evening.skyRotationY > noon.skyRotationY);
  assert.ok(Math.abs((evening.skyRotationY - morning.skyRotationY) - Math.PI) < 0.001);

  const clearNight = computeSkyboxState(0.0, 'sunny', 0, 0, 0);
  const rainyNight = computeSkyboxState(0.0, 'rainy', 1, 0, 0);
  assert.ok(rainyNight.starVisibility < clearNight.starVisibility * 0.25);
});
