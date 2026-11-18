import {
  BuildingInstance,
  BuildingType,
  CartCargoType,
  ResourceCartState,
  WorldState,
} from './types';

export const MAX_LOGISTICS_CARTS = 14;
const STONE_BRIDGE_X = 68;
const STONE_BRIDGE_Z = 6;

export interface LogisticsRoute {
  key: string;
  origin: BuildingInstance;
  destination: BuildingInstance;
  cargoType: CartCargoType;
  amount: number;
}

export interface CartDeliveryEvent {
  x: number;
  z: number;
  cargoType: CartCargoType;
  amount: number;
  isCaravan?: boolean;
}

function findNearestCompletedBuilding(
  buildings: BuildingInstance[],
  origin: BuildingInstance,
  types: BuildingType[],
): BuildingInstance | undefined {
  let best: BuildingInstance | undefined;
  let bestDist = Infinity;
  for (const b of buildings) {
    if (!b.completed || b.id === origin.id || !types.includes(b.type)) continue;
    const d = Math.hypot(b.x - origin.x, b.z - origin.z);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

export function deriveLogisticsRoutes(world: WorldState): LogisticsRoute[] {
  const routes: LogisticsRoute[] = [];
  const activeConstruction = world.buildings.find((b) => !b.completed);
  const keep = world.buildings.find((b) => b.completed && b.type === 'keep') ?? world.buildings[0];
  if (!keep) return routes;

  for (const origin of world.buildings) {
    if (!origin.completed) continue;

    if (origin.type === 'farm') {
      const dest =
        findNearestCompletedBuilding(world.buildings, origin, ['granary', 'bakery']) ??
        findNearestCompletedBuilding(world.buildings, origin, ['market']) ??
        keep;
      routes.push({
        key: `route_${origin.id}_grain`,
        origin,
        destination: dest,
        cargoType: 'grain',
        amount: 2 + Math.max(0, origin.level - 1),
      });
    } else if (origin.type === 'lumber_camp') {
      const dest =
        (activeConstruction && activeConstruction.id !== origin.id ? activeConstruction : undefined) ??
        findNearestCompletedBuilding(world.buildings, origin, ['blacksmith', 'market']) ??
        keep;
      routes.push({
        key: `route_${origin.id}_timber`,
        origin,
        destination: dest,
        cargoType: 'timber',
        amount: (world.forestryDriveDays > 0 ? 4 : 2) + Math.max(0, origin.level - 1),
      });
    } else if (origin.type === 'quarry') {
      const dest =
        (activeConstruction && activeConstruction.id !== origin.id ? activeConstruction : undefined) ??
        keep;
      routes.push({
        key: `route_${origin.id}_stone`,
        origin,
        destination: dest,
        cargoType: 'stone',
        amount: 2 + Math.max(0, origin.level - 1),
      });
    } else if (origin.type === 'bakery') {
      const dest =
        findNearestCompletedBuilding(world.buildings, origin, ['market', 'granary', 'tavern']) ??
        keep;
      routes.push({
        key: `route_${origin.id}_bread`,
        origin,
        destination: dest,
        cargoType: 'bread',
        amount: 2 + Math.max(0, origin.level - 1),
      });
    } else if (origin.type === 'blacksmith') {
      const dest =
        findNearestCompletedBuilding(world.buildings, origin, ['barracks', 'watchtower']) ?? keep;
      routes.push({
        key: `route_${origin.id}_iron`,
        origin,
        destination: dest,
        cargoType: 'iron_arms',
        amount: 1 + Math.max(0, origin.level - 1),
      });
    } else if (origin.type === 'market') {
      const dest =
        findNearestCompletedBuilding(world.buildings, origin, ['tavern']) ?? keep;
      routes.push({
        key: `route_${origin.id}_trade`,
        origin,
        destination: dest,
        cargoType: 'trade_goods',
        amount: 3 + Math.max(0, origin.level - 1),
      });
    }
  }

  return routes.slice(0, MAX_LOGISTICS_CARTS - 2);
}

function getEndpointPair(
  originX: number,
  originZ: number,
  destX: number,
  destZ: number,
  trimOrigin = true,
): { ax: number; az: number; bx: number; bz: number; distance: number; crossesBridge: boolean } {
  const dx = destX - originX;
  const dz = destZ - originZ;
  const fullDist = Math.hypot(dx, dz);
  if (fullDist < 1) {
    return {
      ax: originX,
      az: originZ + 2.5,
      bx: destX,
      bz: destZ + 2.5,
      distance: 4,
      crossesBridge: false,
    };
  }
  const nx = dx / fullDist;
  const nz = dz / fullDist;
  const offsetA = trimOrigin ? Math.min(3.4, fullDist * 0.22) : 0;
  const offsetB = Math.min(3.6, fullDist * 0.22);
  const ax = originX + nx * offsetA;
  const az = originZ + nz * offsetA;
  const bx = destX - nx * offsetB;
  const bz = destZ - nz * offsetB;

  const crossesBridge = (ax < 61 && bx > 74) || (ax > 74 && bx < 61);
  if (crossesBridge) {
    const leg1 = Math.hypot(STONE_BRIDGE_X - ax, STONE_BRIDGE_Z - az);
    const leg2 = Math.hypot(bx - STONE_BRIDGE_X, bz - STONE_BRIDGE_Z);
    return {
      ax,
      az,
      bx,
      bz,
      distance: Math.max(6, leg1 + leg2),
      crossesBridge: true,
    };
  }

  return {
    ax,
    az,
    bx,
    bz,
    distance: Math.max(4, Math.hypot(bx - ax, bz - az)),
    crossesBridge: false,
  };
}

function positionCartFromEndpoints(
  cart: ResourceCartState,
  originX: number,
  originZ: number,
  destX: number,
  destZ: number,
  trimOrigin = true,
): number {
  const { ax, az, bx, bz, distance, crossesBridge } = getEndpointPair(
    originX,
    originZ,
    destX,
    destZ,
    trimOrigin,
  );
  const startX = cart.returning ? bx : ax;
  const startZ = cart.returning ? bz : az;
  const endX = cart.returning ? ax : bx;
  const endZ = cart.returning ? az : bz;
  const t = Math.max(0, Math.min(1, cart.progress));

  if (crossesBridge) {
    const d1 = Math.hypot(STONE_BRIDGE_X - startX, STONE_BRIDGE_Z - startZ);
    const d2 = Math.hypot(endX - STONE_BRIDGE_X, endZ - STONE_BRIDGE_Z);
    const total = Math.max(0.01, d1 + d2);
    const split = d1 / total;
    if (t <= split && split > 0.001) {
      const localT = t / split;
      cart.x = startX + (STONE_BRIDGE_X - startX) * localT;
      cart.z = startZ + (STONE_BRIDGE_Z - startZ) * localT;
      cart.facing = Math.atan2(STONE_BRIDGE_X - startX, STONE_BRIDGE_Z - startZ);
    } else {
      const localT = (t - split) / Math.max(0.001, 1 - split);
      cart.x = STONE_BRIDGE_X + (endX - STONE_BRIDGE_X) * localT;
      cart.z = STONE_BRIDGE_Z + (endZ - STONE_BRIDGE_Z) * localT;
      cart.facing = Math.atan2(endX - STONE_BRIDGE_X, endZ - STONE_BRIDGE_Z);
    }
    return distance;
  }

  cart.x = startX + (endX - startX) * t;
  cart.z = startZ + (endZ - startZ) * t;
  cart.facing = Math.atan2(endX - startX, endZ - startZ);
  return distance;
}

export function syncLogisticsCarts(world: WorldState, staggerInitial = false): void {
  if (!Array.isArray(world.carts)) {
    world.carts = [];
  }

  const routes = deriveLogisticsRoutes(world);
  const routeByOrigin = new Map<string, LogisticsRoute>();
  for (const r of routes) {
    routeByOrigin.set(r.origin.id, r);
  }

  const market = world.buildings.find((b) => b.completed && b.type === 'market');
  const activeCaravanFactions = new Set<string>();
  if (market) {
    for (const f of world.factions) {
      if ((f.id === 'oakhaven' || f.id === 'ironmarch') && (f.status === 'trade_pact' || f.status === 'allied')) {
        activeCaravanFactions.add(f.id);
      }
    }
  }

  // Keep valid domestic carts & valid inter-kingdom caravans
  world.carts = world.carts.filter((c) => {
    if (c.isCaravan) {
      return Boolean(c.factionId && activeCaravanFactions.has(c.factionId) && market);
    }
    const route = routeByOrigin.get(c.originBuildingId);
    const destExists = world.buildings.some((b) => b.id === c.destinationBuildingId);
    return Boolean(route && destExists);
  });

  const existingOrigins = new Set(world.carts.filter((c) => !c.isCaravan).map((c) => c.originBuildingId));
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (existingOrigins.has(r.origin.id) || world.carts.length >= MAX_LOGISTICS_CARTS) {
      continue;
    }
    const baseSpeed = r.cargoType === 'stone' ? 3.2 : r.cargoType === 'timber' ? 3.5 : 3.9;
    const initialProgress = staggerInitial ? ((i * 0.23 + 0.14) % 0.85) : 0;
    const cart: ResourceCartState = {
      id: `cart_${r.origin.id}`,
      cargoType: r.cargoType,
      amount: r.amount,
      originBuildingId: r.origin.id,
      destinationBuildingId: r.destination.id,
      x: r.origin.x,
      z: r.origin.z,
      facing: 0,
      speed: baseSpeed,
      progress: initialProgress,
      returning: false,
    };
    positionCartFromEndpoints(cart, r.origin.x, r.origin.z, r.destination.x, r.destination.z, true);
    world.carts.push(cart);
    existingOrigins.add(r.origin.id);
  }

  // Inter-kingdom trade caravans (Oakhaven from West highway, Ironmarch from East across Stone Bridge)
  if (market) {
    const existingCaravans = new Set(world.carts.filter((c) => c.isCaravan).map((c) => c.factionId));
    for (const factionId of activeCaravanFactions) {
      if (existingCaravans.has(factionId) || world.carts.length >= MAX_LOGISTICS_CARTS) continue;
      const isWest = factionId === 'oakhaven';
      const ox = isWest ? -108 : 112;
      const oz = 6;
      const caravan: ResourceCartState = {
        id: `caravan_${factionId}`,
        cargoType: isWest ? 'trade_goods' : 'iron_arms',
        amount: isWest ? 8 : 3,
        originBuildingId: `frontier_${factionId}`,
        destinationBuildingId: market.id,
        originX: ox,
        originZ: oz,
        destX: market.x,
        destZ: market.z,
        x: ox,
        z: oz,
        facing: 0,
        speed: 4.1,
        progress: staggerInitial ? (isWest ? 0.32 : 0.18) : 0,
        returning: false,
        isCaravan: true,
        factionId,
      };
      positionCartFromEndpoints(caravan, ox, oz, market.x, market.z, false);
      world.carts.push(caravan);
    }
  }
}

export function applyCartDelivery(
  world: WorldState,
  cargoType: CartCargoType,
  amount: number,
  isCaravan = false,
): void {
  if (isCaravan) {
    if (cargoType === 'iron_arms') {
      world.resources.iron += amount;
      world.resources.gold += 10;
    } else {
      world.resources.gold += amount;
      world.resources.food += 4;
    }
    return;
  }

  if (cargoType === 'grain' || cargoType === 'bread') {
    world.resources.food += amount;
  } else if (cargoType === 'timber') {
    world.resources.wood += amount;
  } else if (cargoType === 'stone') {
    world.resources.stone += amount;
  } else if (cargoType === 'iron_arms') {
    world.resources.iron += amount;
    world.resources.gold += 2;
  } else if (cargoType === 'trade_goods') {
    world.resources.gold += amount;
  }
}

export function stepResourceCarts(
  world: WorldState,
  dt: number,
  weatherSpeedMultiplier = 1,
): CartDeliveryEvent[] {
  syncLogisticsCarts(world, false);
  const deliveries: CartDeliveryEvent[] = [];
  const routes = deriveLogisticsRoutes(world);
  const routeByOrigin = new Map<string, LogisticsRoute>();
  for (const r of routes) {
    routeByOrigin.set(r.origin.id, r);
  }

  for (const cart of world.carts) {
    if ((cart.raidedCooldown ?? 0) > 0) {
      cart.raidedCooldown = Math.max(0, (cart.raidedCooldown ?? 0) - dt);
    }

    if (cart.isCaravan) {
      const market = world.buildings.find((b) => b.id === cart.destinationBuildingId);
      if (!market) continue;
      const ox = cart.originX ?? -108;
      const oz = cart.originZ ?? 6;
      const { distance } = getEndpointPair(ox, oz, market.x, market.z, false);
      const effectiveSpeed = cart.speed * weatherSpeedMultiplier;
      cart.progress += (effectiveSpeed * dt) / distance;

      if (cart.progress >= 1) {
        if (!cart.returning) {
          applyCartDelivery(world, cart.cargoType, cart.amount, true);
          deliveries.push({
            x: market.x,
            z: market.z,
            cargoType: cart.cargoType,
            amount: cart.amount,
            isCaravan: true,
          });
          cart.returning = true;
          cart.progress = 0;
        } else {
          cart.returning = false;
          cart.progress = 0;
        }
      }
      positionCartFromEndpoints(cart, ox, oz, market.x, market.z, false);
      continue;
    }

    const origin = world.buildings.find((b) => b.id === cart.originBuildingId);
    let destination = world.buildings.find((b) => b.id === cart.destinationBuildingId);
    if (!origin || !destination) continue;

    const { distance } = getEndpointPair(origin.x, origin.z, destination.x, destination.z, true);
    const effectiveSpeed = cart.speed * weatherSpeedMultiplier;
    cart.progress += (effectiveSpeed * dt) / distance;

    if (cart.progress >= 1) {
      if (!cart.returning) {
        // Loaded cart arrived at storage / construction / hub -> deposit cargo into realm stock!
        applyCartDelivery(world, cart.cargoType, cart.amount, false);
        deliveries.push({
          x: destination.x,
          z: destination.z,
          cargoType: cart.cargoType,
          amount: cart.amount,
        });
        cart.returning = true;
        cart.progress = 0;
      } else {
        // Empty cart arrived back at work site -> reload & refresh route destination if needed
        const latestRoute = routeByOrigin.get(origin.id);
        if (latestRoute) {
          cart.destinationBuildingId = latestRoute.destination.id;
          cart.amount = latestRoute.amount;
          destination = latestRoute.destination;
        }
        cart.returning = false;
        cart.progress = 0;
      }
    }

    positionCartFromEndpoints(cart, origin.x, origin.z, destination.x, destination.z, true);
  }

  return deliveries;
}
