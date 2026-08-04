// =============================================
// StudyLoop — plants_renderer.js
// Procedural plant sprite renderer.
//
// All sprites are generated as inline SVG data URIs,
// so the game needs zero asset files and new plants
// can be added by simply adding a draw function.
// =============================================

const PlantRenderer = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- tiny SVG string helpers ----
  const el = (tag, attrs) => {
    const a = Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    return `<${tag} ${a}/>`;
  };
  const ellipse = (cx, cy, rx, ry, fill, extra = '') =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const circle = (cx, cy, r, fill, extra = '') =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
  const rect = (x, y, w, h, fill, rx = 0, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
  const path = (d, attrs = '') => `<path d="${d}" ${attrs}/>`;
  const leaf = (cx, cy, rx, ry, angle, fill = '#5a9e4b') =>
    ellipse(cx, cy, rx, ry, fill, `transform="rotate(${angle} ${cx} ${cy})"`);

  const wrap = (inner) =>
    `<svg xmlns="${SVG_NS}" viewBox="0 0 64 64">${inner}</svg>`;

  const toDataUri = (svg) =>
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  // =============================================
  // Generic early stages (shared by every plant)
  // =============================================
  function drawSeed(seedColor) {
    return (
      ellipse(32, 58, 13, 4.5, '#7d5f42') +
      ellipse(32, 57, 12, 4, '#9a7a54') +
      circle(28, 55.5, 1.6, seedColor) +
      circle(33, 56.5, 1.6, seedColor) +
      circle(37, 55, 1.4, seedColor)
    );
  }

  function drawSprout(stemColor = '#4f8f43', leafColor = '#63b253') {
    return (
      ellipse(32, 58, 11, 3.5, '#8a6a48') +
      path('M32 58 C31 52 31 48 32 43', `stroke="${stemColor}" stroke-width="2.4" fill="none" stroke-linecap="round"`) +
      leaf(27.5, 47, 5, 2.6, -28, leafColor) +
      leaf(36.5, 45, 5, 2.6, 24, leafColor)
    );
  }

  // =============================================
  // Per-type stage 2-4 artwork
  // =============================================
  const GREEN_STEM = '#4f8f43';

  const artists = {
    sprout_flower: [
      // stage 2 — bud
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 C31 48 31 40 32 32', `stroke="${GREEN_STEM}" stroke-width="2.6" fill="none" stroke-linecap="round"`) +
        leaf(26.5, 46, 5.5, 2.8, -30) +
        leaf(37.5, 42, 5.5, 2.8, 26) +
        circle(32, 30, 3.6, '#f2cf5b') +
        circle(32, 30, 2, '#e8b83f'),
      // stage 3 — big bud
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 C31 46 31 36 32 27', `stroke="${GREEN_STEM}" stroke-width="2.8" fill="none" stroke-linecap="round"`) +
        leaf(26, 46, 6, 3, -32) +
        leaf(38, 41, 6, 3, 28) +
        circle(32, 25, 4.6, '#f2cf5b') +
        ellipse(32, 23, 3, 4.4, '#fff6e0'),
      // stage 4 — daisy bloom
      () => {
        let petals = '';
        for (let i = 0; i < 8; i++) {
          petals += ellipse(32, 13, 3, 6, '#fffdf4', `transform="rotate(${i * 45} 32 20)"`);
        }
        return (
          ellipse(32, 58, 11, 3.5, '#8a6a48') +
          path('M32 58 C31 46 31 34 32 24', `stroke="${GREEN_STEM}" stroke-width="3" fill="none" stroke-linecap="round"`) +
          leaf(25.5, 46, 6.5, 3.2, -32) +
          leaf(38.5, 40, 6.5, 3.2, 28) +
          petals +
          circle(32, 20, 4.4, '#f5b942') +
          circle(32, 20, 2.4, '#e09c2a')
        );
      },
    ],

    sunflower: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 L32 36', `stroke="${GREEN_STEM}" stroke-width="3" fill="none" stroke-linecap="round"`) +
        leaf(26, 48, 6, 3, -30) +
        leaf(38, 44, 6, 3, 28) +
        circle(32, 33, 4.2, '#6fae4e'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 L32 28', `stroke="${GREEN_STEM}" stroke-width="3.4" fill="none" stroke-linecap="round"`) +
        leaf(25, 48, 7, 3.4, -30) +
        leaf(39, 42, 7, 3.4, 28) +
        circle(32, 24, 5.4, '#7a4b26') +
        circle(32, 24, 6.8, 'none', 'stroke="#f2c14e" stroke-width="2.4" stroke-dasharray="3 3"'),
      () => {
        let petals = '';
        for (let i = 0; i < 12; i++) {
          petals += ellipse(32, 9.5, 3.4, 7.5, '#f7c948', `transform="rotate(${i * 30} 32 19)"`);
        }
        let seeds = '';
        [[-2, -1], [2, 1], [0, -3], [-3, 2], [3, -2], [1, 3], [-1, 1]].forEach(([dx, dy]) => {
          seeds += circle(32 + dx, 19 + dy, 0.8, '#5a3517');
        });
        return (
          ellipse(32, 58, 11, 3.5, '#8a6a48') +
          path('M32 58 L32 26', `stroke="${GREEN_STEM}" stroke-width="3.6" fill="none" stroke-linecap="round"`) +
          leaf(24.5, 48, 7.5, 3.6, -30) +
          leaf(39.5, 42, 7.5, 3.6, 28) +
          petals +
          circle(32, 19, 6.4, '#7a4b26') +
          seeds
        );
      },
    ],

    cactus: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        rect(27, 42, 10, 16, '#4e9a51', 5) +
        path('M30 46 l0 8 M34 46 l0 8', 'stroke="#3d7d40" stroke-width="1.2"'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        rect(27, 34, 10, 24, '#4e9a51', 5) +
        rect(19.5, 40, 6, 11, '#4e9a51', 3) +
        rect(23, 44, 6, 4, '#4e9a51', 2) +
        path('M30 38 l0 16 M34 38 l0 16', 'stroke="#3d7d40" stroke-width="1.2"'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        rect(27, 28, 10, 30, '#4e9a51', 5) +
        rect(19, 36, 6, 12, '#4e9a51', 3) +
        rect(23, 42, 6, 4, '#4e9a51', 2) +
        rect(39, 33, 6, 12, '#4e9a51', 3) +
        rect(35, 39, 6, 4, '#4e9a51', 2) +
        path('M30 32 l0 22 M34 32 l0 22', 'stroke="#3d7d40" stroke-width="1.2"') +
        circle(32, 26, 4, '#ef7fa5') +
        circle(32, 26, 1.8, '#f7c948') +
        ellipse(28.5, 24.5, 2.4, 3.4, '#f49aba', 'transform="rotate(-24 28.5 24.5)"') +
        ellipse(35.5, 24.5, 2.4, 3.4, '#f49aba', 'transform="rotate(24 35.5 24.5)"'),
    ],

    rose_bush: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        circle(26, 52, 6.5, '#3f7d44') +
        circle(38, 52, 6.5, '#498c4a') +
        circle(32, 48, 7, '#57a155') +
        circle(32, 44, 2.4, '#d6455b'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        circle(24, 51, 8, '#3f7d44') +
        circle(40, 51, 8, '#498c4a') +
        circle(32, 45, 9, '#57a155') +
        circle(27, 41, 3, '#d6455b') +
        circle(37, 39, 3, '#d6455b'),
      () => {
        const rose = (cx, cy, r) =>
          circle(cx, cy, r, '#d6455b') +
          circle(cx, cy, r * 0.62, '#b03048') +
          circle(cx, cy, r * 0.3, '#8e2438');
        return (
          ellipse(32, 58, 11, 3.5, '#8a6a48') +
          circle(23, 51, 9, '#3f7d44') +
          circle(41, 51, 9, '#498c4a') +
          circle(32, 44, 10, '#57a155') +
          circle(25, 38, 4, '#4c934f') +
          circle(39, 37, 4, '#4c934f') +
          rose(25, 38, 4) +
          rose(39, 37, 4) +
          rose(32, 32, 4.6)
        );
      },
    ],

    tree_sapling: [
      () =>
        ellipse(32, 58, 12, 4, '#8a6a48') +
        rect(29.5, 44, 5, 14, '#8a6242', 2) +
        circle(32, 38, 9, '#57a155') +
        circle(26, 42, 6, '#498c4a'),
      () =>
        ellipse(32, 58, 12, 4, '#8a6a48') +
        rect(29, 38, 6, 20, '#8a6242', 2) +
        circle(32, 30, 12, '#57a155') +
        circle(23, 36, 8, '#498c4a') +
        circle(41, 36, 8, '#4c934f'),
      () =>
        ellipse(32, 58, 12, 4, '#8a6a48') +
        rect(28.5, 34, 7, 24, '#7a5535', 2.5) +
        path('M32 44 L24 36 M32 40 L40 33', 'stroke="#7a5535" stroke-width="2.4" stroke-linecap="round"') +
        circle(32, 25, 14, '#3f7d44') +
        circle(20, 32, 10, '#498c4a') +
        circle(44, 32, 10, '#57a155') +
        circle(32, 34, 11, '#4c934f') +
        circle(24, 30, 2.4, '#e0433e') +
        circle(40, 27, 2.4, '#e0433e') +
        circle(33, 20, 2.4, '#e0433e') +
        circle(30, 36, 2.4, '#e0433e') +
        circle(24, 29.4, 0.7, '#ffb3a0') +
        circle(40, 26.4, 0.7, '#ffb3a0') +
        circle(33, 19.4, 0.7, '#ffb3a0'),
    ],

    // ---- NEW PLANTS ----
    tulip: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 C31 50 31 44 32 38', `stroke="${GREEN_STEM}" stroke-width="2.6" fill="none" stroke-linecap="round"`) +
        path('M30 52 C24 48 22 42 23 38 C27 42 29 46 30 52 Z', 'fill="#5a9e4b"') +
        path('M34 54 C40 50 42 44 41 40 C37 44 35 48 34 54 Z', 'fill="#63b253"') +
        ellipse(32, 35, 3, 4, '#e8a0b4'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 C31 48 31 38 32 30', `stroke="${GREEN_STEM}" stroke-width="2.8" fill="none" stroke-linecap="round"`) +
        path('M30 50 C23 46 21 39 22 34 C27 39 29 44 30 50 Z', 'fill="#5a9e4b"') +
        path('M34 52 C41 48 43 41 42 36 C37 41 35 46 34 52 Z', 'fill="#63b253"') +
        path('M27 30 C27 24 29 21 32 21 C35 21 37 24 37 30 C37 33 35 35 32 35 C29 35 27 33 27 30 Z', 'fill="#e2546e"'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M32 58 C31 46 31 36 32 28', `stroke="${GREEN_STEM}" stroke-width="3" fill="none" stroke-linecap="round"`) +
        path('M30 48 C22 44 20 36 21 30 C27 36 29 42 30 48 Z', 'fill="#5a9e4b"') +
        path('M34 50 C42 46 44 38 43 32 C37 38 35 44 34 50 Z', 'fill="#63b253"') +
        path('M26 26 C25 19 27 14 29 15 C30 12 34 12 35 15 C37 14 39 19 38 26 C37 30 35 32 32 32 C29 32 27 30 26 26 Z', 'fill="#e2546e"') +
        path('M29 15 C29 19 30 22 32 23 C34 22 35 19 35 15', 'fill="none" stroke="#c23a55" stroke-width="1.4"') +
        path('M32 23 L32 30', 'stroke="#c23a55" stroke-width="1.2"') +
        ellipse(32, 16, 2.6, 2, '#f8d867'),
    ],

    lavender: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M28 58 L28 40 M34 58 L34 38', 'stroke="#5a9e4b" stroke-width="1.8" fill="none" stroke-linecap="round"') +
        ellipse(28, 38, 2, 3, '#9a7fd0') +
        ellipse(34, 36, 2, 3, '#9a7fd0'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        path('M26 58 L26 38 M32 58 L32 34 M38 58 L38 39', 'stroke="#5a9e4b" stroke-width="1.8" fill="none" stroke-linecap="round"') +
        ellipse(26, 35, 2.4, 4, '#8e6fc0') +
        ellipse(32, 31, 2.4, 4.5, '#7b5bb3') +
        ellipse(38, 36, 2.4, 4, '#9a7fd0'),
      () => {
        const spike = (x, top, h, c1, c2) => {
          let dots = '';
          for (let i = 0; i < h; i++) {
            const y = top + i * 3;
            const w = 2.8 - i * 0.18;
            dots += ellipse(x + (i % 2 ? 1 : -1) * 0.8, y, w, 2, i % 2 ? c1 : c2);
          }
          return dots;
        };
        return (
          ellipse(32, 58, 11, 3.5, '#8a6a48') +
          path('M24 58 L24 38 M29 58 L29 32 M34 58 L34 29 M39 58 L39 33 M43 58 L43 40', 'stroke="#5a9e4b" stroke-width="1.8" fill="none" stroke-linecap="round"') +
          spike(24, 33, 2, '#9a7fd0', '#8e6fc0') +
          spike(29, 26, 3, '#8e6fc0', '#7b5bb3') +
          spike(34, 22, 3, '#7b5bb3', '#6a4ca0') +
          spike(39, 27, 3, '#8e6fc0', '#7b5bb3') +
          spike(43, 35, 2, '#9a7fd0', '#8e6fc0')
        );
      },
    ],

    mushroom: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        rect(30, 50, 4, 8, '#efe3cc', 2) +
        path('M26 51 C26 46 29 44 32 44 C35 44 38 46 38 51 Z', 'fill="#d9c8a9"'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        rect(29, 46, 6, 12, '#f2e8d5', 3) +
        path('M23 47 C23 40 27 36 32 36 C37 36 41 40 41 47 Z', 'fill="#c96f5a"') +
        circle(29, 42, 1.5, '#fdf3e3') +
        circle(35, 40, 1.2, '#fdf3e3'),
      () =>
        ellipse(32, 58, 12, 4, '#8a6a48') +
        rect(28, 40, 8, 18, '#f2e8d5', 4) +
        path('M18 41 C18 31 24 25 32 25 C40 25 46 31 46 41 Z', 'fill="#c0453e"') +
        circle(26, 33, 2.4, '#fdf3e3') +
        circle(36, 30, 2, '#fdf3e3') +
        circle(40, 37, 1.6, '#fdf3e3') +
        rect(44, 50, 4, 8, '#efe3cc', 2) +
        path('M41 51 C41 47 43 45 46 45 C49 45 51 47 51 51 Z', 'fill="#c96f5a"'),
    ],

    strawberry: [
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        leaf(26, 52, 6, 3, -25, '#4c934f') +
        leaf(38, 52, 6, 3, 25, '#4c934f') +
        leaf(32, 49, 6, 3, 0, '#57a155') +
        circle(32, 46, 2.2, '#fffdf4') +
        circle(32, 46, 1, '#f5b942'),
      () =>
        ellipse(32, 58, 11, 3.5, '#8a6a48') +
        leaf(24, 50, 7, 3.4, -28, '#4c934f') +
        leaf(40, 50, 7, 3.4, 28, '#4c934f') +
        leaf(32, 46, 7, 3.4, 0, '#57a155') +
        leaf(27, 45, 6, 3, -45, '#63b253') +
        circle(28, 52, 3, '#a8cf6f') +
        circle(37, 53, 3, '#a8cf6f'),
      () => {
        const berry = (cx, cy, r) =>
          path(
            `M${cx} ${cy - r} C${cx + r} ${cy - r} ${cx + r * 1.1} ${cy + r * 0.4} ${cx} ${cy + r * 1.3} C${cx - r * 1.1} ${cy + r * 0.4} ${cx - r} ${cy - r} ${cx} ${cy - r} Z`,
            'fill="#e0433e"'
          ) +
          circle(cx - r * 0.35, cy, 0.5, '#ffd9a0') +
          circle(cx + r * 0.3, cy + r * 0.3, 0.5, '#ffd9a0') +
          circle(cx, cy + r * 0.6, 0.5, '#ffd9a0') +
          leaf(cx, cy - r, r * 0.7, r * 0.35, 0, '#4c934f');
        return (
          ellipse(32, 58, 11, 3.5, '#8a6a48') +
          leaf(23, 48, 7.5, 3.6, -30, '#4c934f') +
          leaf(41, 48, 7.5, 3.6, 30, '#4c934f') +
          leaf(32, 43, 7.5, 3.6, 0, '#57a155') +
          leaf(26, 42, 6.5, 3, -45, '#63b253') +
          leaf(38, 42, 6.5, 3, 45, '#63b253') +
          berry(26, 52, 3.4) +
          berry(38, 53, 3.4) +
          berry(32, 55, 3.8)
        );
      },
    ],
  };

  /** Per-type tuning: seed dot color + display size curve. */
  const typeMeta = {
    sprout_flower: { seed: '#e8d8b0' },
    sunflower: { seed: '#6b4a2a' },
    cactus: { seed: '#4e9a51' },
    rose_bush: { seed: '#d6455b' },
    tree_sapling: { seed: '#8a6242' },
    tulip: { seed: '#e8a0b4' },
    lavender: { seed: '#8e6fc0' },
    mushroom: { seed: '#efe3cc' },
    strawberry: { seed: '#e0433e' },
  };

  const validTypes = Object.keys(artists);
  const uriCache = {};

  function normalizeStage(stage) {
    return Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
  }

  function buildSprite(plantType, stage) {
    const type = validTypes.includes(plantType) ? plantType : 'sprout_flower';
    const meta = typeMeta[type] || { seed: '#e8d8b0' };
    if (stage === 0) return wrap(drawSeed(meta.seed));
    if (stage === 1) return wrap(drawSprout());
    return wrap(artists[type][stage - 2]());
  }

  const api = {
    /**
     * Resolves the sprite for a given plant type and growth stage.
     * Returns a data URI (works in <img> and SVG <image>).
     * @param {string} plantType
     * @param {number} stage - 0 to 4
     * @returns {string}
     */
    resolvePlantSVGPath(plantType, stage) {
      const type = validTypes.includes(plantType) ? plantType : 'sprout_flower';
      const s = normalizeStage(stage);
      const key = `${type}:${s}`;
      if (!uriCache[key]) uriCache[key] = toDataUri(buildSprite(type, s));
      return uriCache[key];
    },

    /** Display size (px) for a planted sprite on the island canvas */
    resolvePlantDisplaySize(plantType, stage) {
      const s = normalizeStage(stage);
      if (plantType === 'tree_sapling') return 36 + s * 16;
      if (plantType === 'mushroom') return 20 + s * 5;
      if (plantType === 'sunflower') return 30 + s * 8;
      return 28 + s * 6;
    },

    /** Kept for backwards compatibility — everything is procedural now. */
    isGameAsset() {
      return false;
    },

    /** All plant types with artwork, in stable order. */
    getPlantTypes() {
      return [...validTypes];
    },
  };

  return api;
})();

window.PlantRenderer = PlantRenderer;
