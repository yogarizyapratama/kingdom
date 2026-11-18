import * as THREE from 'three';
import { BuildingType, CartCargoType, KingWeaponType, Profession } from '../simulation/types';
import { ProceduralTexturePack } from './textures';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  head: THREE.Object3D;
  cape?: THREE.Object3D;
  shieldGroup?: THREE.Group;
  weaponMeshes?: Record<KingWeaponType, THREE.Object3D>;
  horseGroup?: THREE.Group;
  horseLegs?: THREE.Object3D[];
  telegraphRing?: THREE.Mesh;
  flashMeshes: THREE.Mesh[];
}

export interface BuildingRig {
  root: THREE.Group;
  foundationGroup: THREE.Group;
  frameGroup: THREE.Group;
  finishedGroup: THREE.Group;
  windmillBlades?: THREE.Object3D;
  bannerCloth?: THREE.Object3D;
  tierBadgeGroup?: THREE.Group;
  tier3Flag?: THREE.Object3D;
  windowMaterials: THREE.MeshStandardMaterial[];
  lastProgressBucket: number;
}

export interface ResourceCartRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Object3D[];
  ponyLegs: THREE.Object3D[];
  cargoGroup: THREE.Group;
}

export function createSharedMaterialLibrary(textures: ProceduralTexturePack) {
  return {
    stone: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.12,
      roughness: 0.88,
      metalness: 0.04,
    }),
    darkStone: new THREE.MeshStandardMaterial({
      color: 0x6f6b64,
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.12,
      roughness: 0.9,
      metalness: 0.05,
    }),
    plaster: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.plasterMap,
      bumpMap: textures.plasterBump,
      bumpScale: 0.09,
      roughness: 0.86,
      metalness: 0.02,
    }),
    timber: new THREE.MeshStandardMaterial({
      color: 0x563922,
      map: textures.barkMap,
      roughness: 0.84,
      metalness: 0.04,
    }),
    paleTimber: new THREE.MeshStandardMaterial({
      color: 0xc2986b,
      map: textures.barkMap,
      roughness: 0.8,
      metalness: 0.04,
    }),
    shingle: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.shingleMap,
      bumpMap: textures.shingleBump,
      bumpScale: 0.1,
      roughness: 0.78,
      metalness: 0.06,
    }),
    thatch: new THREE.MeshStandardMaterial({
      color: 0xdcc07a,
      map: textures.shingleMap,
      bumpMap: textures.shingleBump,
      bumpScale: 0.08,
      roughness: 0.9,
      metalness: 0.0,
    }),
    slateRoof: new THREE.MeshStandardMaterial({
      color: 0xcbd2da,
      map: textures.shingleMap,
      bumpMap: textures.shingleBump,
      bumpScale: 0.1,
      roughness: 0.68,
      metalness: 0.14,
    }),
    royalCrimson: new THREE.MeshStandardMaterial({
      color: 0x941e27,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
    }),
    royalBlue: new THREE.MeshStandardMaterial({
      color: 0x25436e,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xe6b84c,
      roughness: 0.24,
      metalness: 0.88,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0xb7c0c9,
      roughness: 0.28,
      metalness: 0.85,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0xdcb190,
      roughness: 0.72,
      metalness: 0.02,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: 0x4b3121,
      roughness: 0.78,
      metalness: 0.08,
    }),
    wheat: new THREE.MeshStandardMaterial({
      color: 0xd8b14c,
      roughness: 0.9,
      metalness: 0.0,
    }),
    contactShadow: new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    }),
  };
}

export type MaterialLibrary = ReturnType<typeof createSharedMaterialLibrary>;

function addShadowDisc(parent: THREE.Group, mat: THREE.Material, radius: number): void {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  parent.add(disc);
}

export function createKingModel(mats: MaterialLibrary): CharacterRig {
  const root = new THREE.Group();
  addShadowDisc(root, mats.contactShadow, 0.85);

  const flashMeshes: THREE.Mesh[] = [];
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Articulated legs
  const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.68, 8);
  const bootMat = mats.leather.clone();

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.17, 0.68, 0);
  const lLegMesh = new THREE.Mesh(legGeo, bootMat);
  lLegMesh.position.y = -0.34;
  lLegMesh.castShadow = true;
  leftLeg.add(lLegMesh);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.17, 0.68, 0);
  const rLegMesh = new THREE.Mesh(legGeo, bootMat);
  rLegMesh.position.y = -0.34;
  rLegMesh.castShadow = true;
  rightLeg.add(rLegMesh);
  bodyGroup.add(rightLeg);

  // Armored torso + royal surcoat
  const armorMat = mats.steel.clone();
  const surcoatMat = mats.royalCrimson.clone();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.72, 10), armorMat);
  torso.position.y = 1.04;
  torso.castShadow = true;
  bodyGroup.add(torso);
  flashMeshes.push(torso);

  const tunicSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.34, 0.38, 10), surcoatMat);
  tunicSkirt.position.y = 0.74;
  tunicSkirt.castShadow = true;
  bodyGroup.add(tunicSkirt);

  // Gold belt + royal pauldrons
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 10), mats.gold);
  belt.position.y = 0.82;
  bodyGroup.add(belt);

  const pauldronGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const lPauldron = new THREE.Mesh(pauldronGeo, mats.gold);
  lPauldron.position.set(-0.34, 1.32, 0);
  bodyGroup.add(lPauldron);
  const rPauldron = new THREE.Mesh(pauldronGeo, mats.gold);
  rPauldron.position.set(0.34, 1.32, 0);
  bodyGroup.add(rPauldron);

  // Royal cape
  const cape = new THREE.Group();
  cape.position.set(0, 1.34, -0.2);
  const capeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.95, 0.06), surcoatMat);
  capeMesh.position.set(0, -0.46, -0.04);
  capeMesh.rotation.x = 0.14;
  capeMesh.castShadow = true;
  cape.add(capeMesh);
  bodyGroup.add(cape);

  // Head + beard + sculpted Golden Crown
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mats.skin.clone());
  cranium.castShadow = true;
  head.add(cranium);
  flashMeshes.push(cranium);

  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 7), new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 0.9 }));
  beard.position.set(0, -0.11, 0.12);
  beard.rotation.x = Math.PI;
  head.add(beard);

  const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.11, 12), mats.gold);
  crownBand.position.y = 0.14;
  head.add(crownBand);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5), mats.gold);
    spire.position.set(Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17);
    head.add(spire);
  }
  bodyGroup.add(head);

  // Left arm + Kite Shield
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.36, 1.32, 0);
  const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.56, 8), armorMat);
  lArmMesh.position.y = -0.26;
  leftArm.add(lArmMesh);

  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(-0.1, -0.32, 0.14);
  shieldGroup.rotation.y = -0.35;
  const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.58, 0.42), mats.royalBlue);
  const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.06), mats.gold);
  shieldGroup.add(shieldFace, shieldRim);
  leftArm.add(shieldGroup);
  bodyGroup.add(leftArm);

  // Right arm + Royal Broadsword
  const rightArm = new THREE.Group();
  rightArm.position.set(0.36, 1.32, 0);
  const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.56, 8), armorMat);
  rArmMesh.position.y = -0.26;
  rightArm.add(rArmMesh);

  const swordGroup = new THREE.Group();
  swordGroup.position.set(0, -0.5, 0.1);
  swordGroup.rotation.x = Math.PI * 0.36;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), mats.leather);
  const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.05), mats.gold);
  crossguard.position.y = 0.1;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.92, 0.02), mats.steel);
  blade.position.y = 0.58;
  blade.castShadow = true;
  swordGroup.add(hilt, crossguard, blade);

  // Unlockable Knight's Waraxe
  const axeGroup = new THREE.Group();
  axeGroup.position.set(0, -0.5, 0.1);
  axeGroup.rotation.x = Math.PI * 0.36;
  axeGroup.visible = false;
  const axeShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6), mats.paleTimber);
  axeShaft.position.y = 0.45;
  const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.28), mats.steel);
  axeHead.position.set(0, 0.85, 0.12);
  const axeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.12), mats.gold);
  axeTrim.position.set(0, 0.85, 0.02);
  axeGroup.add(axeShaft, axeHead, axeTrim);

  // Unlockable Royal Halberd
  const halberdGroup = new THREE.Group();
  halberdGroup.position.set(0, -0.52, 0.1);
  halberdGroup.rotation.x = Math.PI * 0.34;
  halberdGroup.visible = false;
  const halbPole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 1.55, 7), mats.paleTimber);
  halbPole.position.y = 0.65;
  const halbSpear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.42, 6), mats.gold);
  halbSpear.position.y = 1.52;
  const halbBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.26), mats.steel);
  halbBlade.position.set(0, 1.25, 0.12);
  halberdGroup.add(halbPole, halbSpear, halbBlade);

  rightArm.add(swordGroup, axeGroup, halberdGroup);
  bodyGroup.add(rightArm);

  // Warhorse Mount (toggled visible when mounted)
  const horseGroup = new THREE.Group();
  horseGroup.visible = false;
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x4b2f21, roughness: 0.72, metalness: 0.05 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x1e1612, roughness: 0.88 });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 1.35, 10), coatMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.05, 0);
  barrel.castShadow = true;
  horseGroup.add(barrel);

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.6), mats.royalCrimson);
  saddle.position.set(0, 1.36, -0.05);
  horseGroup.add(saddle);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.72, 8), coatMat);
  neck.position.set(0, 1.46, 0.62);
  neck.rotation.x = 0.45;
  horseGroup.add(neck);

  const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.54), coatMat);
  horseHead.position.set(0, 1.72, 0.92);
  horseHead.rotation.x = 0.35;
  horseGroup.add(horseHead);

  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.64, 0.16), maneMat);
  mane.position.set(0, 1.56, 0.52);
  mane.rotation.x = 0.45;
  horseGroup.add(mane);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.68, 6), maneMat);
  tail.position.set(0, 0.92, -0.78);
  tail.rotation.x = -0.35;
  horseGroup.add(tail);

  const horseLegs: THREE.Object3D[] = [];
  const legOffsets: Array<[number, number]> = [
    [-0.22, 0.46],
    [0.22, 0.46],
    [-0.22, -0.46],
    [0.22, -0.46],
  ];
  for (const [lx, lz] of legOffsets) {
    const hLeg = new THREE.Group();
    hLeg.position.set(lx, 0.95, lz);
    const legCol = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.95, 7), coatMat);
    legCol.position.y = -0.475;
    legCol.castShadow = true;
    hLeg.add(legCol);
    horseGroup.add(hLeg);
    horseLegs.push(hLeg);
  }

  root.add(horseGroup);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    head,
    cape,
    shieldGroup,
    weaponMeshes: {
      broadsword: swordGroup,
      waraxe: axeGroup,
      royal_halberd: halberdGroup,
    },
    horseGroup,
    horseLegs,
    flashMeshes,
  };
}

export function createNpcModel(profession: Profession, mats: MaterialLibrary, tintIndex = 0): CharacterRig {
  const root = new THREE.Group();
  addShadowDisc(root, mats.contactShadow, 0.62);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  const flashMeshes: THREE.Mesh[] = [];

  const tunicColors: Record<Profession, number[]> = {
    farmer: [0x7e6a46, 0x627349, 0x8f6b47],
    woodcutter: [0x584431, 0x45523b],
    builder: [0x8c5533, 0x6f4b32],
    merchant: [0x6e314f, 0x3b5875],
    baker: [0xd9ccb8, 0xc79f68],
    blacksmith: [0x3d3835, 0x4f3c33],
    miner: [0x595754, 0x6b604e],
    child: [0x4c89b8, 0xd49b3d, 0x5c964d, 0xb84c56, 0x7a5ba8],
    guard: [0x3d4e66, 0x465466],
    soldier: [0x7b2b2b, 0x334b6b],
    commander: [0x8c232a],
    chancellor: [0x4c3563],
  };
  const palette = tunicColors[profession];
  const tunicColor = palette[tintIndex % palette.length];
  const tunicMat = new THREE.MeshStandardMaterial({ color: tunicColor, roughness: 0.78, metalness: 0.05 });

  if (profession === 'child') {
    root.scale.setScalar(0.64);
  }

  const legGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.62, 7);
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.62, 0);
  const lMesh = new THREE.Mesh(legGeo, mats.leather);
  lMesh.position.y = -0.31;
  lMesh.castShadow = true;
  leftLeg.add(lMesh);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0.62, 0);
  const rMesh = new THREE.Mesh(legGeo, mats.leather);
  rMesh.position.y = -0.31;
  rMesh.castShadow = true;
  rightLeg.add(rMesh);
  bodyGroup.add(rightLeg);

  const isArmored = profession === 'guard' || profession === 'soldier' || profession === 'commander';
  const torsoMat = isArmored ? mats.steel.clone() : tunicMat;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.68, 9), torsoMat);
  torso.position.y = 0.96;
  torso.castShadow = true;
  bodyGroup.add(torso);
  flashMeshes.push(torso);

  if (isArmored) {
    const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.46), tunicMat);
    tabard.position.y = 0.88;
    bodyGroup.add(tabard);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.44, 0);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mats.skin.clone());
  cranium.castShadow = true;
  head.add(cranium);
  flashMeshes.push(cranium);

  // Profession headwear
  if (profession === 'farmer') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 12), mats.wheat);
    brim.position.y = 0.11;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.14, 10), mats.wheat);
    crown.position.y = 0.18;
    head.add(brim, crown);
  } else if (isArmored) {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.steel);
    helm.position.y = 0.03;
    head.add(helm);
    if (profession === 'commander') {
      const plume = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.28), mats.royalCrimson);
      plume.position.set(0, 0.24, -0.02);
      head.add(plume);
    }
  } else if (profession === 'merchant' || profession === 'chancellor') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.18, 0.16, 10), tunicMat);
    cap.position.y = 0.15;
    head.add(cap);
  } else if (profession === 'builder' || profession === 'miner') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.22, 8), mats.leather);
    hood.position.y = 0.17;
    head.add(hood);
  } else if (profession === 'baker') {
    const chefCap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 10), mats.plaster);
    chefCap.position.y = 0.18;
    head.add(chefCap);
  } else if (profession === 'blacksmith') {
    const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 10), mats.royalCrimson);
    bandana.position.y = 0.11;
    head.add(bandana);
  } else if (profession === 'child') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.timber);
    hair.position.y = 0.04;
    head.add(hair);
  }
  bodyGroup.add(head);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 1.24, 0);
  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 7), tunicMat);
  lArm.position.y = -0.24;
  leftArm.add(lArm);
  if (isArmored) {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.36), mats.royalBlue);
    shield.position.set(-0.08, -0.26, 0.1);
    leftArm.add(shield);
  }
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 1.24, 0);
  const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 7), tunicMat);
  rArm.position.y = -0.24;
  rightArm.add(rArm);

  // Profession tool / weapon
  if (profession === 'builder' || profession === 'blacksmith') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 6), mats.timber);
    handle.position.set(0, -0.44, 0.14);
    handle.rotation.x = Math.PI * 0.45;
    const headHammer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.1), mats.steel);
    headHammer.position.set(0, -0.44, 0.36);
    rightArm.add(handle, headHammer);
  } else if (profession === 'woodcutter' || profession === 'miner') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), mats.timber);
    handle.position.set(0, -0.42, 0.18);
    handle.rotation.x = Math.PI * 0.4;
    const headTool = new THREE.Mesh(
      profession === 'miner' ? new THREE.BoxGeometry(0.26, 0.06, 0.08) : new THREE.BoxGeometry(0.04, 0.18, 0.22),
      mats.steel,
    );
    headTool.position.set(0, -0.3, 0.42);
    rightArm.add(handle, headTool);
  } else if (profession === 'farmer') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.15, 6), mats.paleTimber);
    pole.position.set(0, -0.35, 0.22);
    pole.rotation.x = Math.PI * 0.22;
    rightArm.add(pole);
  } else if (profession === 'baker') {
    const peel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.45), mats.paleTimber);
    peel.position.set(0, -0.42, 0.26);
    rightArm.add(peel);
  } else if (isArmored) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6), mats.timber);
    shaft.position.set(0, -0.2, 0.18);
    shaft.rotation.x = Math.PI * 0.15;
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), mats.steel);
    spearTip.position.set(0, 0.58, 0.32);
    spearTip.rotation.x = Math.PI * 0.15;
    rightArm.add(shaft, spearTip);
  }
  bodyGroup.add(rightArm);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    head,
    flashMeshes,
  };
}

export function createBanditModel(
  archetype: 'raider' | 'archer_skirmisher' | 'chieftain',
  mats: MaterialLibrary,
): CharacterRig {
  const scale = archetype === 'chieftain' ? 1.24 : 1.0;
  const root = new THREE.Group();
  addShadowDisc(root, mats.contactShadow, 0.68 * scale);

  const bodyGroup = new THREE.Group();
  bodyGroup.scale.setScalar(scale);
  root.add(bodyGroup);
  const flashMeshes: THREE.Mesh[] = [];

  const darkGarb = new THREE.MeshStandardMaterial({
    color: archetype === 'chieftain' ? 0x3b1818 : 0x2f2d2a,
    roughness: 0.85,
    metalness: 0.08,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x4d5259, roughness: 0.42, metalness: 0.72 });

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.62, 0);
  const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.62, 7), mats.leather);
  lLeg.position.y = -0.31;
  leftLeg.add(lLeg);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.62, 0);
  const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.62, 7), mats.leather);
  rLeg.position.y = -0.31;
  rightLeg.add(rLeg);
  bodyGroup.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.7, 9), darkGarb);
  torso.position.y = 0.96;
  torso.castShadow = true;
  bodyGroup.add(torso);
  flashMeshes.push(torso);

  const head = new THREE.Group();
  head.position.set(0, 1.45, 0);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 8), mats.skin.clone());
  head.add(cranium);
  flashMeshes.push(cranium);

  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 7), ironMat);
  helm.position.y = 0.16;
  head.add(helm);
  if (archetype === 'chieftain') {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), mats.wheat);
      horn.position.set(side * 0.19, 0.18, 0);
      horn.rotation.z = -side * 0.75;
      head.add(horn);
    }
  }
  bodyGroup.add(head);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.33, 1.24, 0);
  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.52, 7), darkGarb);
  lArm.position.y = -0.24;
  leftArm.add(lArm);
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.33, 1.24, 0);
  const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.52, 7), darkGarb);
  rArm.position.y = -0.24;
  rightArm.add(rArm);

  const axeShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), mats.timber);
  axeShaft.position.set(0, -0.45, 0.18);
  axeShaft.rotation.x = Math.PI * 0.38;
  const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.26), ironMat);
  axeBlade.position.set(0, -0.34, 0.48);
  rightArm.add(axeShaft, axeBlade);
  bodyGroup.add(rightArm);

  // Windup telegraph ring on ground
  const telegraphRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.05, 24),
    new THREE.MeshBasicMaterial({ color: 0xe64a38, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  );
  telegraphRing.rotation.x = -Math.PI / 2;
  telegraphRing.position.y = 0.05;
  telegraphRing.visible = false;
  root.add(telegraphRing);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    head,
    telegraphRing,
    flashMeshes,
  };
}

export function createBuildingGroup(type: BuildingType, mats: MaterialLibrary): BuildingRig {
  const root = new THREE.Group();
  const foundationGroup = new THREE.Group();
  const frameGroup = new THREE.Group();
  const finishedGroup = new THREE.Group();
  const windowMaterials: THREE.MeshStandardMaterial[] = [];

  const makeWindowMat = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0xffa630,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    windowMaterials.push(m);
    return m;
  };

  // Stage 1: Foundation stakes + stone perimeter
  const padRadius = type === 'keep' ? 5.2 : type === 'farm' ? 4.0 : 3.0;
  const stonePad = new THREE.Mesh(
    new THREE.BoxGeometry(padRadius * 1.6, 0.22, padRadius * 1.4),
    mats.darkStone,
  );
  stonePad.position.y = 0.11;
  stonePad.receiveShadow = true;
  foundationGroup.add(stonePad);
  for (const [sx, sz] of [
    [-padRadius * 0.72, -padRadius * 0.62],
    [padRadius * 0.72, -padRadius * 0.62],
    [-padRadius * 0.72, padRadius * 0.62],
    [padRadius * 0.72, padRadius * 0.62],
  ]) {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.1, 6), mats.timber);
    stake.position.set(sx, 0.55, sz);
    foundationGroup.add(stake);
  }

  // Stage 2: Timber scaffolding & framing
  const framePad = stonePad.clone();
  frameGroup.add(framePad);
  for (const [sx, sz] of [
    [-padRadius * 0.65, -padRadius * 0.55],
    [padRadius * 0.65, -padRadius * 0.55],
    [-padRadius * 0.65, padRadius * 0.55],
    [padRadius * 0.65, padRadius * 0.55],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.0, 0.24), mats.timber);
    post.position.set(sx, 1.5, sz);
    post.castShadow = true;
    frameGroup.add(post);
  }
  const crossBeam1 = new THREE.Mesh(new THREE.BoxGeometry(padRadius * 1.4, 0.2, 0.22), mats.paleTimber);
  crossBeam1.position.set(0, 2.8, padRadius * 0.55);
  const crossBeam2 = crossBeam1.clone();
  crossBeam2.position.z = -padRadius * 0.55;
  frameGroup.add(crossBeam1, crossBeam2);

  // Stage 3: Full detailed 3-12 part medieval architecture
  let windmillBlades: THREE.Object3D | undefined;
  let bannerCloth: THREE.Object3D | undefined;

  if (type === 'keep') {
    // Grand Stronghold Citadel Keep with crenellations, flanking turrets, iron portcullis, and royal banner
    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(8.6, 5.8, 6.8), mats.stone);
    mainHall.position.y = 2.9;
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    finishedGroup.add(mainHall);

    // Battlement merlons along front & back parapet
    for (let mx = -3.6; mx <= 3.6; mx += 1.44) {
      for (const mz of [3.2, -3.2]) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.45), mats.darkStone);
        merlon.position.set(mx, 6.2, mz);
        merlon.castShadow = true;
        finishedGroup.add(merlon);
      }
    }

    const centralTower = new THREE.Mesh(new THREE.BoxGeometry(4.6, 9.2, 4.6), mats.stone);
    centralTower.position.set(0, 4.6, -0.5);
    centralTower.castShadow = true;
    finishedGroup.add(centralTower);

    const spireRoof = new THREE.Mesh(new THREE.ConeGeometry(3.55, 3.6, 4), mats.slateRoof);
    spireRoof.position.set(0, 11.0, -0.5);
    spireRoof.rotation.y = Math.PI / 4;
    spireRoof.castShadow = true;
    finishedGroup.add(spireRoof);

    // Corner turrets
    for (const sx of [-4.4, 4.4]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.38, 7.2, 10), mats.stone);
      turret.position.set(sx, 3.6, 2.7);
      turret.castShadow = true;
      finishedGroup.add(turret);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.52, 2.2, 10), mats.royalCrimson);
      cap.position.set(sx, 8.3, 2.7);
      cap.castShadow = true;
      finishedGroup.add(cap);
    }

    // Gatehouse jambs, oak doors & iron portcullis bars
    const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.3, 0.6), mats.darkStone);
    gateFrame.position.set(0, 1.65, 3.45);
    const gateDoor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.7, 0.3), mats.timber);
    gateDoor.position.set(0, 1.35, 3.62);
    finishedGroup.add(gateFrame, gateDoor);
    for (const px of [-0.75, -0.25, 0.25, 0.75]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5), mats.steel);
      bar.position.set(px, 1.4, 3.8);
      finishedGroup.add(bar);
    }

    // Stone entrance steps
    const stepApron = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 1.6), mats.darkStone);
    stepApron.position.set(0, 0.12, 4.2);
    stepApron.receiveShadow = true;
    finishedGroup.add(stepApron);

    // Royal Banner Pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), mats.gold);
    pole.position.set(0, 12.8, -0.5);
    bannerCloth = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 0.05), mats.royalCrimson);
    bannerCloth.position.set(0.78, 13.7, -0.5);
    finishedGroup.add(pole, bannerCloth);

    const winMat = makeWindowMat();
    for (const wx of [-2.3, 2.3]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 0.14), winMat);
      win.position.set(wx, 4.1, 3.42);
      finishedGroup.add(win);
    }
  } else if (type === 'granary') {
    // Iconic Stronghold raised timber-and-stone Granary
    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.7, 4.0), mats.darkStone);
    stoneBase.position.y = 0.35;
    stoneBase.receiveShadow = true;
    finishedGroup.add(stoneBase);

    for (const [sx, sz] of [
      [-1.9, -1.5],
      [1.9, -1.5],
      [-1.9, 1.5],
      [1.9, 1.5],
    ]) {
      const stilt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.32), mats.timber);
      stilt.position.set(sx, 1.0, sz);
      stilt.castShadow = true;
      finishedGroup.add(stilt);
    }

    const loft = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 3.8), mats.paleTimber);
    loft.position.y = 2.65;
    loft.castShadow = true;
    loft.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.9, 4), mats.shingle);
    roof.position.y = 4.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    finishedGroup.add(loft, roof);

    // Grain sacks piled at entrance
    for (const [gx, gz] of [
      [-0.7, 2.3],
      [0.1, 2.4],
      [0.8, 2.2],
    ]) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mats.wheat);
      sack.scale.set(1.1, 0.85, 0.9);
      sack.position.set(gx, 0.38, gz);
      sack.castShadow = true;
      finishedGroup.add(sack);
    }
  } else if (type === 'bakery') {
    // Half-timbered Village Bakery with stone brick bread oven & firewood
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 3.8), mats.stone);
    plinth.position.y = 0.25;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.5, 3.5), mats.plaster);
    walls.position.y = 1.75;
    walls.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.1, 4), mats.shingle);
    roof.position.y = 4.05;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    const ovenDome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mats.stone);
    ovenDome.position.set(-2.1, 1.0, 0.2);
    ovenDome.castShadow = true;
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 3.8, 8), mats.darkStone);
    chimney.position.set(-1.9, 2.6, -0.4);
    chimney.castShadow = true;

    const hearthGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff8a2b, emissive: 0xff5500, emissiveIntensity: 1.5 }),
    );
    hearthGlow.position.set(-2.1, 0.8, 1.15);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.25), mats.timber);
    door.position.set(0.4, 1.1, 1.78);

    finishedGroup.add(plinth, walls, roof, ovenDome, chimney, hearthGlow, door);
  } else if (type === 'blacksmith') {
    // Stronghold Armory & Smithy with stone forge, glowing coals, and anvil
    const stoneApron = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.22, 4.2), mats.darkStone);
    stoneApron.position.y = 0.11;
    stoneApron.receiveShadow = true;
    const shedWalls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 3.4), mats.plaster);
    shedWalls.position.set(0, 1.4, -0.3);
    shedWalls.castShadow = true;
    const shedRoof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.0, 4), mats.slateRoof);
    shedRoof.position.set(0, 3.6, -0.3);
    shedRoof.rotation.y = Math.PI / 4;
    shedRoof.castShadow = true;

    const forgeChimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.4, 1.2), mats.stone);
    forgeChimney.position.set(-1.6, 2.2, 0.8);
    forgeChimney.castShadow = true;
    const coals = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.35, 0.75),
      new THREE.MeshStandardMaterial({ color: 0xff7020, emissive: 0xff4500, emissiveIntensity: 1.7 }),
    );
    coals.position.set(-1.6, 0.9, 1.35);

    const anvilBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.65, 8), mats.timber);
    anvilBlock.position.set(1.1, 0.45, 1.45);
    const anvilIron = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.3), mats.steel);
    anvilIron.position.set(1.1, 0.88, 1.45);

    finishedGroup.add(stoneApron, shedWalls, shedRoof, forgeChimney, coals, anvilBlock, anvilIron);
  } else if (type === 'stone_wall') {
    // Fortified Castle Curtain Wall Segment with battlements & timber walkway
    const baseWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.2, 1.7), mats.stone);
    baseWall.position.y = 2.1;
    baseWall.castShadow = true;
    baseWall.receiveShadow = true;

    const walkway = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 1.9), mats.paleTimber);
    walkway.position.set(0, 3.85, 0.2);

    finishedGroup.add(baseWall, walkway);
    for (let mx = -2.2; mx <= 2.2; mx += 1.1) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.85, 0.48), mats.darkStone);
      merlon.position.set(mx, 4.6, -0.62);
      merlon.castShadow = true;
      finishedGroup.add(merlon);
    }
  } else if (type === 'cottage' || type === 'tavern') {
    const isTavern = type === 'tavern';
    const w = isTavern ? 5.2 : 4.2;
    const d = isTavern ? 4.4 : 3.6;
    const h = isTavern ? 3.2 : 2.6;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.55, d + 0.25), mats.stone);
    plinth.position.y = 0.275;
    plinth.receiveShadow = true;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.plaster);
    walls.position.y = 0.55 + h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.3, 4),
      isTavern ? mats.shingle : mats.thatch,
    );
    roof.position.y = 0.55 + h + 1.15;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), mats.stone);
    chimney.position.set(w * 0.3, 0.55 + h + 1.1, -d * 0.22);
    chimney.castShadow = true;

    // Door with solid timber jambs
    const doorJamb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.22), mats.timber);
    doorJamb.position.set(0, 1.15, d / 2 + 0.05);
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.65, 0.26), mats.paleTimber);
    doorLeaf.position.set(0, 1.1, d / 2 + 0.06);

    const winMat = makeWindowMat();
    const winL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.14), winMat);
    winL.position.set(-w * 0.3, 1.85, d / 2 + 0.04);
    const winR = winL.clone();
    winR.position.x = w * 0.3;

    finishedGroup.add(plinth, walls, roof, chimney, doorJamb, doorLeaf, winL, winR);

    if (isTavern) {
      const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), mats.timber);
      signPost.position.set(1.4, 2.6, d / 2 + 0.45);
      const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.08), mats.gold);
      signBoard.position.set(1.4, 2.3, d / 2 + 0.8);
      finishedGroup.add(signPost, signBoard);
    }
  } else if (type === 'farm') {
    // Barn + 6 wheat rows + wooden windmill
    const barn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 2.8), mats.plaster);
    barn.position.set(-1.6, 1.15, -1.2);
    barn.castShadow = true;
    const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.8, 4), mats.thatch);
    barnRoof.position.set(-1.6, 3.2, -1.2);
    barnRoof.rotation.y = Math.PI / 4;
    barnRoof.castShadow = true;
    finishedGroup.add(barn, barnRoof);

    // Windmill tower with rotating blades
    const millTower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 4.4, 8), mats.stone);
    millTower.position.set(1.9, 2.2, -1.4);
    millTower.castShadow = true;
    const millCap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.2, 8), mats.shingle);
    millCap.position.set(1.9, 5.0, -1.4);
    finishedGroup.add(millTower, millCap);

    const hub = new THREE.Group();
    hub.position.set(1.9, 4.0, -0.45);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.06), mats.paleTimber);
      arm.rotation.z = (i * Math.PI) / 2;
      arm.position.set(Math.sin((-i * Math.PI) / 2) * 0.9, Math.cos((-i * Math.PI) / 2) * 0.9, 0);
      hub.add(arm);
    }
    windmillBlades = hub;
    finishedGroup.add(hub);

    // Wheat crop strips
    for (let r = 0; r < 5; r++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.45, 0.48), mats.wheat);
      strip.position.set(0, 0.22, 1.1 + r * 0.72);
      strip.castShadow = true;
      finishedGroup.add(strip);
    }
  } else if (type === 'lumber_camp') {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 2.8), mats.paleTimber);
    shed.position.set(-0.5, 1.1, -0.8);
    shed.castShadow = true;
    const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.25, 3.3), mats.shingle);
    shedRoof.position.set(-0.5, 2.35, -0.8);
    shedRoof.rotation.x = 0.18;
    finishedGroup.add(shed, shedRoof);

    // Stacked timber logs
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3 - row; col++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 7), mats.timber);
        log.rotation.z = Math.PI / 2;
        log.position.set(1.2, 0.22 + row * 0.38, 0.8 + col * 0.46 + row * 0.23);
        log.castShadow = true;
        finishedGroup.add(log);
      }
    }
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.65, 8), mats.timber);
    stump.position.set(-1.6, 0.32, 1.4);
    finishedGroup.add(stump);
  } else if (type === 'quarry') {
    const rockA = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), mats.stone);
    rockA.position.set(-0.8, 1.1, -0.8);
    rockA.castShadow = true;
    const rockB = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), mats.darkStone);
    rockB.position.set(1.2, 0.75, -0.4);
    rockB.castShadow = true;
    const cranePost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.8, 7), mats.timber);
    cranePost.position.set(0.4, 1.9, 1.1);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), mats.paleTimber);
    craneArm.position.set(1.1, 3.5, 1.1);
    craneArm.rotation.z = 0.22;
    finishedGroup.add(rockA, rockB, cranePost, craneArm);
  } else if (type === 'market') {
    const cobbleApron = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 5.2), mats.darkStone);
    cobbleApron.position.y = 0.06;
    cobbleApron.receiveShadow = true;
    finishedGroup.add(cobbleApron);

    const stallOffsets: Array<[number, number, THREE.Material]> = [
      [-1.7, -1.1, mats.royalCrimson],
      [1.7, -1.1, mats.royalBlue],
      [0, 1.4, mats.gold],
    ];
    for (const [sx, sz, canopyMat] of stallOffsets) {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.9), mats.paleTimber);
      counter.position.set(sx, 0.45, sz);
      counter.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.4), canopyMat);
      canopy.position.set(sx, 2.05, sz);
      canopy.rotation.x = 0.18;
      canopy.castShadow = true;
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6), mats.timber);
      postL.position.set(sx - 0.95, 1.05, sz - 0.35);
      const postR = postL.clone();
      postR.position.x = sx + 0.95;
      finishedGroup.add(counter, canopy, postL, postR);
    }
  } else if (type === 'barracks') {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.0, 4.2), mats.stone);
    hall.position.y = 1.5;
    hall.castShadow = true;
    hall.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.2, 4), mats.slateRoof);
    roof.position.y = 4.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    const bannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mats.timber);
    bannerPole.position.set(2.4, 1.3, 2.4);
    bannerCloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), mats.royalBlue);
    bannerCloth.position.set(2.85, 2.2, 2.4);

    // Training dummy outside
    const dummyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), mats.timber);
    dummyPost.position.set(-2.3, 0.8, 2.7);
    const dummyArms = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.14), mats.paleTimber);
    dummyArms.position.set(-2.3, 1.25, 2.7);

    finishedGroup.add(hall, roof, bannerPole, bannerCloth, dummyPost, dummyArms);
  } else if (type === 'watchtower') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 3.4), mats.darkStone);
    base.position.y = 0.6;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.6, 2.6), mats.stone);
    shaft.position.y = 4.0;
    shaft.castShadow = true;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 3.2), mats.darkStone);
    parapet.position.y = 7.15;
    parapet.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.0, 4), mats.slateRoof);
    roof.position.y = 8.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    for (const [mx, mz] of [
      [-1.3, -1.3],
      [1.3, -1.3],
      [-1.3, 1.3],
      [1.3, 1.3],
    ]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.55), mats.stone);
      merlon.position.set(mx, 7.85, mz);
      finishedGroup.add(merlon);
    }

    const brazier = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xff6a00, emissiveIntensity: 1.4 }),
    );
    brazier.position.set(0, 7.8, 1.35);
    finishedGroup.add(base, shaft, parapet, roof, brazier);
  }

  // Upgrade Tier Pennant Crest (visible for Tier 2 & Tier 3 upgraded buildings)
  const tierBadgeGroup = new THREE.Group();
  tierBadgeGroup.position.set(padRadius * 0.52, 0, padRadius * 0.42);
  tierBadgeGroup.visible = false;
  const crestPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.6, 6), mats.gold);
  crestPole.position.y = 2.3;
  const tier2Flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.46, 0.05), mats.royalBlue);
  tier2Flag.position.set(0.45, 4.2, 0);
  const tier3Flag = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.05), mats.gold);
  tier3Flag.position.set(0.4, 3.65, 0);
  tier3Flag.visible = false;
  tierBadgeGroup.add(crestPole, tier2Flag, tier3Flag);
  finishedGroup.add(tierBadgeGroup);

  root.add(foundationGroup, frameGroup, finishedGroup);
  return {
    root,
    foundationGroup,
    frameGroup,
    finishedGroup,
    windmillBlades,
    bannerCloth,
    tierBadgeGroup,
    tier3Flag,
    windowMaterials,
    lastProgressBucket: -1,
  };
}

export function updateBuildingVisualProgress(
  rig: BuildingRig,
  progress: number,
  isNight: boolean,
  level = 1,
): void {
  const bucket = progress < 0.34 ? 0 : progress < 1 ? 1 : 2;
  if (bucket !== rig.lastProgressBucket) {
    rig.lastProgressBucket = bucket;
    rig.foundationGroup.visible = bucket === 0;
    rig.frameGroup.visible = bucket === 1;
    rig.finishedGroup.visible = bucket === 2;
  }
  if (rig.tierBadgeGroup) {
    rig.tierBadgeGroup.visible = bucket === 2 && level >= 2;
  }
  if (rig.tier3Flag) {
    rig.tier3Flag.visible = level >= 3;
  }
  const emissiveTarget = isNight ? 1.15 : 0.25;
  for (const m of rig.windowMaterials) {
    m.emissiveIntensity = emissiveTarget;
  }
}

export function createResourceCartModel(
  cargoType: CartCargoType,
  mats: MaterialLibrary,
  isCaravan = false,
): ResourceCartRig {
  const root = new THREE.Group();
  addShadowDisc(root, mats.contactShadow, 1.45);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const cartOak = new THREE.MeshStandardMaterial({ color: 0x94643b, roughness: 0.82, metalness: 0.04 });
  const darkOak = new THREE.MeshStandardMaterial({ color: 0x6e4728, roughness: 0.85, metalness: 0.05 });

  // Wooden wagon undercarriage & slatted cargo bed (centered at z = -0.32 so pack-pony pulls ahead at +Z)
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 1.72), mats.paleTimber);
  bed.position.set(0, 0.52, -0.32);
  bed.castShadow = true;
  bed.receiveShadow = true;
  bodyGroup.add(bed);

  // Sideboards & front/rear rails
  for (const sx of [-0.55, 0.55]) {
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 1.72), cartOak);
    sideRail.position.set(sx, 0.78, -0.32);
    sideRail.castShadow = true;
    bodyGroup.add(sideRail);
  }
  const backGate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.36, 0.08), cartOak);
  backGate.position.set(0, 0.75, -1.14);
  const frontGate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.4, 0.08), cartOak);
  frontGate.position.set(0, 0.77, 0.5);
  bodyGroup.add(backGate, frontGate);

  // Corner timber posts & brass lantern at front left
  for (const [px, pz] of [
    [-0.55, -1.14],
    [0.55, -1.14],
    [-0.55, 0.5],
    [0.55, 0.5],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1), darkOak);
    post.position.set(px, 0.82, pz);
    bodyGroup.add(post);
  }
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.18, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: 0xffa630,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    }),
  );
  lantern.position.set(-0.55, 1.15, 0.52);
  bodyGroup.add(lantern);

  // Forward hitch shafts
  for (const sx of [-0.3, 0.3]) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.18), cartOak);
    shaft.position.set(sx, 0.64, 1.05);
    bodyGroup.add(shaft);
  }

  // 4 Spoked iron-rimmed wheels touching y = 0 flush
  const wheels: THREE.Object3D[] = [];
  const wheelRadius = 0.36;
  const wheelCoords: Array<[number, number]> = [
    [-0.64, 0.25],
    [0.64, 0.25],
    [-0.64, -0.88],
    [0.64, -0.88],
  ];
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.11, 14);
  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.82, wheelRadius * 0.82, 0.125, 12);
  const spokeGeo = new THREE.BoxGeometry(0.13, wheelRadius * 1.7, 0.06);

  for (const [wx, wz] of wheelCoords) {
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(wx, wheelRadius, wz);

    const ironRim = new THREE.Mesh(tireGeo, mats.steel);
    ironRim.rotation.z = Math.PI / 2;
    ironRim.castShadow = true;

    const woodDisc = new THREE.Mesh(rimGeo, darkOak);
    woodDisc.rotation.z = Math.PI / 2;

    const spokeA = new THREE.Mesh(spokeGeo, mats.paleTimber);
    const spokeB = new THREE.Mesh(spokeGeo, mats.paleTimber);
    spokeB.rotation.x = Math.PI / 2;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), mats.gold);
    hub.rotation.z = Math.PI / 2;

    wheelPivot.add(ironRim, woodDisc, spokeA, spokeB, hub);
    root.add(wheelPivot);
    wheels.push(wheelPivot);
  }

  // Pack-pony pulling the cart (+Z)
  const ponyMat = new THREE.MeshStandardMaterial({ color: 0x7d5236, roughness: 0.78, metalness: 0.04 });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, roughness: 0.9 });

  const ponyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.96, 9), ponyMat);
  ponyBody.rotation.x = Math.PI / 2;
  ponyBody.position.set(0, 0.78, 1.32);
  ponyBody.castShadow = true;
  bodyGroup.add(ponyBody);

  const harness = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 6, 12), mats.leather);
  harness.position.set(0, 0.82, 1.62);
  bodyGroup.add(harness);

  const ponyNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.48, 8), ponyMat);
  ponyNeck.position.set(0, 1.02, 1.72);
  ponyNeck.rotation.x = 0.42;
  bodyGroup.add(ponyNeck);

  const ponyHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.36), ponyMat);
  ponyHead.position.set(0, 1.18, 1.94);
  ponyHead.rotation.x = 0.35;
  bodyGroup.add(ponyHead);

  const ponyMane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.1), maneMat);
  ponyMane.position.set(0, 1.09, 1.64);
  ponyMane.rotation.x = 0.42;
  bodyGroup.add(ponyMane);

  const ponyLegs: THREE.Object3D[] = [];
  for (const [lx, lz] of [
    [-0.14, 1.62],
    [0.14, 1.62],
    [-0.14, 1.0],
    [0.14, 1.0],
  ]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, 0.66, lz);
    const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.66, 6), ponyMat);
    legMesh.position.y = -0.33;
    legMesh.castShadow = true;
    legPivot.add(legMesh);
    bodyGroup.add(legPivot);
    ponyLegs.push(legPivot);
  }

  // Distinct Cargo Payload Group (toggled visible while delivering, hidden on empty return trip)
  const cargoGroup = new THREE.Group();
  cargoGroup.position.set(0, 0.6, -0.32);

  if (cargoType === 'grain') {
    for (const [sx, sy, sz] of [
      [-0.24, 0.22, -0.32],
      [0.24, 0.22, -0.32],
      [-0.24, 0.22, 0.26],
      [0.24, 0.22, 0.26],
      [0, 0.48, -0.04],
    ]) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mats.wheat);
      sack.scale.set(1.05, 0.78, 1.25);
      sack.position.set(sx, sy, sz);
      sack.castShadow = true;
      cargoGroup.add(sack);
    }
  } else if (cargoType === 'timber') {
    const logBarkMat = new THREE.MeshStandardMaterial({ color: 0x855834, roughness: 0.86, metalness: 0.02 });
    const cutEndMat = new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.76, metalness: 0.02 });
    for (let row = 0; row < 2; row++) {
      const count = 3 - row;
      for (let c = 0; c < count; c++) {
        const lx = (c - (count - 1) / 2) * 0.3;
        const ly = 0.16 + row * 0.24;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.48, 8), logBarkMat);
        log.rotation.x = Math.PI / 2;
        log.position.set(lx, ly, 0);
        log.castShadow = true;
        const endCaps = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8), cutEndMat);
        endCaps.rotation.x = Math.PI / 2;
        endCaps.position.set(lx, ly, 0);
        cargoGroup.add(log, endCaps);
      }
    }
  } else if (cargoType === 'stone') {
    for (const [bx, by, bz] of [
      [-0.24, 0.2, -0.34],
      [0.24, 0.2, -0.34],
      [-0.24, 0.2, 0.26],
      [0.24, 0.2, 0.26],
      [0, 0.54, -0.05],
    ]) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.34, 0.5),
        by > 0.4 ? mats.darkStone : mats.stone,
      );
      block.position.set(bx, by, bz);
      block.castShadow = true;
      cargoGroup.add(block);
    }
  } else if (cargoType === 'bread') {
    const breadMat = new THREE.MeshStandardMaterial({ color: 0xc97b32, roughness: 0.76 });
    for (const bz of [-0.36, 0.32]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 0.58), mats.paleTimber);
      crate.position.set(0, 0.14, bz);
      cargoGroup.add(crate);
      for (const lx of [-0.22, 0.22]) {
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), breadMat);
        loaf.scale.set(1.2, 0.7, 1.0);
        loaf.position.set(lx, 0.31, bz);
        cargoGroup.add(loaf);
      }
    }
  } else if (cargoType === 'iron_arms') {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.36, 0.65), darkOak);
    chest.position.set(0, 0.2, -0.28);
    cargoGroup.add(chest);
    for (let ix = -0.28; ix <= 0.28; ix += 0.28) {
      const ingot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.55), mats.steel);
      ingot.position.set(ix, 0.44, -0.28);
      cargoGroup.add(ingot);
    }
    const spearBundle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.35, 7), mats.steel);
    spearBundle.rotation.x = Math.PI / 2;
    spearBundle.position.set(0, 0.22, 0.34);
    cargoGroup.add(spearBundle);
  } else {
    // trade_goods: royal cask + gilded merchant coffer
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.66, 10), cartOak);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.28, -0.34);
    barrel.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.42, 0.52), mats.royalCrimson);
    chest.position.set(0, 0.22, 0.3);
    chest.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.54), mats.gold);
    trim.position.set(0, 0.4, 0.3);
    cargoGroup.add(barrel, chest, trim);
  }

  bodyGroup.add(cargoGroup);

  if (isCaravan) {
    // Grand Crimson & Gold Royal Caravan Awning + Heraldic Pennants
    const canopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 1.82, 10, 1, false, 0, Math.PI),
      mats.royalCrimson,
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.rotation.y = Math.PI / 2;
    canopy.position.set(0, 1.24, -0.32);
    canopy.castShadow = true;
    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.1, 1.78), mats.gold);
    goldTrim.position.set(0, 1.05, -0.32);
    const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), mats.gold);
    poleL.position.set(-0.56, 1.5, 0.48);
    const flagL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.45), mats.gold);
    flagL.position.set(-0.56, 1.88, 0.28);
    bodyGroup.add(canopy, goldTrim, poleL, flagL);
  }

  return {
    root,
    bodyGroup,
    wheels,
    ponyLegs,
    cargoGroup,
  };
}
