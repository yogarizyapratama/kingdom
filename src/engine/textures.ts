import * as THREE from 'three';

export interface ProceduralTexturePack {
  grassMap: THREE.CanvasTexture;
  grassBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  plasterMap: THREE.CanvasTexture;
  plasterBump: THREE.CanvasTexture;
  shingleMap: THREE.CanvasTexture;
  shingleBump: THREE.CanvasTexture;
  roadMap: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

const REAL_ASSET_URLS = {
  grass: '/src/assets/images/medieval_grass_texture_1795005114064.jpg',
  stone: '/src/assets/images/castle_stone_texture_1795005115178.jpg',
  road: '/src/assets/images/cobble_road_texture_1795005115541.jpg',
  roof: '/src/assets/images/medieval_roof_texture_1795005114749.jpg',
  plaster: '/src/assets/images/timber_plaster_texture_1795005116389.jpg',
};

function makeCanvasTexture(
  size: number,
  drawFallback: (ctx: CanvasRenderingContext2D, size: number) => void,
  srgb: boolean,
  anisotropy: number,
  repeat = 1,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFallback(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return { canvas, ctx, tex };
}

function hydrateRealTexturePair(
  url: string,
  albedoCtx: CanvasRenderingContext2D,
  albedoTex: THREE.CanvasTexture,
  bumpCtx: CanvasRenderingContext2D,
  bumpTex: THREE.CanvasTexture,
  size: number,
  contrast = 1.35,
): void {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    albedoCtx.drawImage(img, 0, 0, size, size);
    albedoTex.needsUpdate = true;

    // Derive crisp linear-space height/bump map from luminance
    const srcData = albedoCtx.getImageData(0, 0, size, size);
    const dstData = bumpCtx.createImageData(size, size);
    const s = srcData.data;
    const d = dstData.data;
    for (let i = 0; i < s.length; i += 4) {
      const lum = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
      const boosted = Math.max(0, Math.min(255, Math.round((lum - 128) * contrast + 128)));
      d[i] = boosted;
      d[i + 1] = boosted;
      d[i + 2] = boosted;
      d[i + 3] = 255;
    }
    bumpCtx.putImageData(dstData, 0, 0);
    bumpTex.needsUpdate = true;
  };
  img.src = url;
}

export function createProceduralTexturePack(maxAnisotropy: number): ProceduralTexturePack {
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));
  const TEX_SIZE = 512;

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 1. Real-world Meadow Grass (tiled densely across widened 480m landmass)
  const grassAlbedo = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#4e6c3a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2400; i++) {
        const pick = rand();
        ctx.fillStyle =
          pick < 0.35
            ? 'rgba(92, 126, 62, 0.35)'
            : pick < 0.7
              ? 'rgba(56, 82, 40, 0.35)'
              : 'rgba(124, 142, 70, 0.24)';
        ctx.fillRect(rand() * s, rand() * s, 3 + rand() * 7, 3 + rand() * 7);
      }
    },
    true,
    aniso,
    46,
  );
  const grassBump = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1800; i++) {
        const v = Math.floor(90 + rand() * 90);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rand() * s, rand() * s, 3 + rand() * 5, 3 + rand() * 5);
      }
    },
    false,
    aniso,
    46,
  );
  hydrateRealTexturePair(
    REAL_ASSET_URLS.grass,
    grassAlbedo.ctx,
    grassAlbedo.tex,
    grassBump.ctx,
    grassBump.tex,
    TEX_SIZE,
    1.25,
  );

  // 2. Real-world Castle Limestone Ashlar Masonry
  const stoneAlbedo = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#7c766d';
      ctx.fillRect(0, 0, s, s);
      const rows = 8;
      const rowH = s / rows;
      for (let r = 0; r < rows; r++) {
        const cols = 4;
        const colW = s / cols;
        const offset = (r % 2) * (colW * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * colW + offset;
          const y = r * rowH;
          const shade = 115 + Math.floor(rand() * 34);
          ctx.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade - 4})`;
          ctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
          ctx.strokeStyle = 'rgba(46, 42, 38, 0.65)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, colW - 4, rowH - 4);
        }
      }
    },
    true,
    aniso,
    2,
  );
  const stoneBump = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#404040';
      ctx.fillRect(0, 0, s, s);
      const rows = 8;
      const rowH = s / rows;
      for (let r = 0; r < rows; r++) {
        const cols = 4;
        const colW = s / cols;
        const offset = (r % 2) * (colW * 0.5);
        for (let c = -1; c <= cols; c++) {
          const v = 165 + Math.floor(rand() * 45);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(c * colW + offset + 4, r * rowH + 4, colW - 8, rowH - 8);
        }
      }
    },
    false,
    aniso,
    2,
  );
  hydrateRealTexturePair(
    REAL_ASSET_URLS.stone,
    stoneAlbedo.ctx,
    stoneAlbedo.tex,
    stoneBump.ctx,
    stoneBump.tex,
    TEX_SIZE,
    1.5,
  );

  // 3. Real-world Tudor Wattle & Daub + Oak Timber Framing
  const plasterAlbedo = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#dfd4be';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rand() > 0.5 ? 'rgba(184, 168, 142, 0.25)' : 'rgba(244, 237, 222, 0.25)';
        ctx.fillRect(rand() * s, rand() * s, 8 + rand() * 18, 8 + rand() * 18);
      }
      ctx.fillStyle = '#4f3825';
      ctx.fillRect(0, 0, s, 26);
      ctx.fillRect(0, s - 26, s, 26);
      ctx.fillRect(0, 0, 26, s);
      ctx.fillRect(s - 26, 0, 26, s);
      ctx.fillRect(s * 0.5 - 12, 0, 24, s);
    },
    true,
    aniso,
    1,
  );
  const plasterBump = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#888888';
      ctx.fillRect(0, 0, s, s);
    },
    false,
    aniso,
    1,
  );
  hydrateRealTexturePair(
    REAL_ASSET_URLS.plaster,
    plasterAlbedo.ctx,
    plasterAlbedo.tex,
    plasterBump.ctx,
    plasterBump.tex,
    TEX_SIZE,
    1.3,
  );

  // 4. Real-world Medieval Dark Slate & Cedar Shingles
  const shingleAlbedo = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#53453d';
      ctx.fillRect(0, 0, s, s);
      const rows = 10;
      const rowH = s / rows;
      for (let r = 0; r < rows; r++) {
        const cols = 8;
        const colW = s / cols;
        const off = (r % 2) * (colW * 0.5);
        for (let c = -1; c <= cols; c++) {
          const shade = rand();
          ctx.fillStyle = shade < 0.35 ? '#4c4645' : shade < 0.7 ? '#3d3938' : '#5e554d';
          ctx.fillRect(c * colW + off + 2, r * rowH + 2, colW - 4, rowH - 4);
        }
      }
    },
    true,
    aniso,
    2,
  );
  const shingleBump = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#707070';
      ctx.fillRect(0, 0, s, s);
    },
    false,
    aniso,
    2,
  );
  hydrateRealTexturePair(
    REAL_ASSET_URLS.roof,
    shingleAlbedo.ctx,
    shingleAlbedo.tex,
    shingleBump.ctx,
    shingleBump.tex,
    TEX_SIZE,
    1.45,
  );

  // 5. Real-world Medieval Cobblestone Road
  const roadAlbedo = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#7e705c';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 320; i++) {
        const v = 120 + Math.floor(rand() * 42);
        ctx.fillStyle = `rgb(${v + 8}, ${v}, ${v - 12})`;
        ctx.beginPath();
        ctx.ellipse(rand() * s, rand() * s, 10 + rand() * 18, 8 + rand() * 14, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    true,
    aniso,
    1,
  );
  const roadBump = makeCanvasTexture(
    TEX_SIZE,
    (ctx, s) => {
      ctx.fillStyle = '#757575';
      ctx.fillRect(0, 0, s, s);
    },
    false,
    aniso,
    1,
  );
  hydrateRealTexturePair(
    REAL_ASSET_URLS.road,
    roadAlbedo.ctx,
    roadAlbedo.tex,
    roadBump.ctx,
    roadBump.tex,
    TEX_SIZE,
    1.55,
  );

  // 6. Procedural Oak & Pine Bark Texture
  const barkMap = makeCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#483322';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 400; i++) {
        const v = Math.floor(45 + rand() * 48);
        ctx.fillStyle = `rgb(${v + 22}, ${v + 10}, ${v})`;
        ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 5, 16 + rand() * 38);
      }
    },
    true,
    aniso,
    2,
  ).tex;

  // 7. Soft Radial Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(8, 10, 14, 0.72)');
  grad.addColorStop(0.55, 'rgba(8, 10, 14, 0.32)');
  grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  contactShadowMap.needsUpdate = true;

  return {
    grassMap: grassAlbedo.tex,
    grassBump: grassBump.tex,
    stoneMap: stoneAlbedo.tex,
    stoneBump: stoneBump.tex,
    plasterMap: plasterAlbedo.tex,
    plasterBump: plasterBump.tex,
    shingleMap: shingleAlbedo.tex,
    shingleBump: shingleBump.tex,
    roadMap: roadAlbedo.tex,
    roadBump: roadBump.tex,
    barkMap,
    contactShadowMap,
    dispose: () => {
      grassAlbedo.tex.dispose();
      grassBump.tex.dispose();
      stoneAlbedo.tex.dispose();
      stoneBump.tex.dispose();
      plasterAlbedo.tex.dispose();
      plasterBump.tex.dispose();
      shingleAlbedo.tex.dispose();
      shingleBump.tex.dispose();
      roadAlbedo.tex.dispose();
      roadBump.tex.dispose();
      barkMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
