// =============================================
// StudyLoop — decor_renderer.js
// Procedural cozy decor sprites (inline SVG data URIs).
// =============================================

const DecorRenderer = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ellipse = (cx, cy, rx, ry, fill, extra = '') =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const circle = (cx, cy, r, fill, extra = '') =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
  const rect = (x, y, w, h, fill, rx = 0, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
  const path = (d, attrs = '') => `<path d="${d}" ${attrs}/>`;
  const wrap = (inner) =>
    `<svg xmlns="${SVG_NS}" viewBox="0 0 64 64">${inner}</svg>`;
  const toDataUri = (svg) =>
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const artists = {
    path_stone() {
      // Fuller tile so adjacent stones read as one path
      return (
        ellipse(32, 44, 22, 11, '#5a6a68', 'opacity="0.4"') +
        ellipse(32, 42, 20, 10, '#b8b4a8') +
        ellipse(32, 41, 17, 8, '#c8c4b8') +
        ellipse(24, 40, 6, 3.5, '#a8a498') +
        ellipse(38, 43, 5.5, 3.2, '#d0ccc0') +
        ellipse(30, 45, 5, 3, '#9a9688') +
        ellipse(36, 38, 4, 2.5, '#d8d4c8') +
        ellipse(26, 38, 2, 1, '#e8e4d8', 'opacity="0.55"') +
        ellipse(40, 41, 1.8, 1, '#e0dcd0', 'opacity="0.45"')
      );
    },

    /** Connector nub used between adjacent stone path tiles (drawn in world space). */
    path_stone_connector() {
      return (
        ellipse(32, 32, 14, 8, '#a8a498') +
        ellipse(32, 31, 11, 6, '#c0bcb0') +
        ellipse(28, 30, 3, 2, '#d0ccc0', 'opacity="0.5"')
      );
    },

    path_dirt() {
      return (
        ellipse(32, 44, 22, 11, '#6a4a28', 'opacity="0.35"') +
        ellipse(32, 42, 20, 10, '#8a6a48', 'opacity="0.9"') +
        ellipse(32, 41, 17, 8, '#a08058') +
        ellipse(24, 40, 5, 2.5, '#7a5a38', 'opacity="0.4"') +
        ellipse(38, 43, 5, 2.5, '#7a5a38', 'opacity="0.35"') +
        ellipse(32, 38, 4, 2, '#b89868', 'opacity="0.4"')
      );
    },

    path_dirt_connector() {
      return (
        ellipse(32, 32, 14, 8, '#8a6a48') +
        ellipse(32, 31, 11, 6, '#a08058')
      );
    },

    pebbles() {
      return (
        ellipse(32, 44, 14, 6, '#5a6a48', 'opacity="0.2"') +
        ellipse(24, 40, 4.5, 3, '#9a9688') +
        ellipse(32, 42, 3.5, 2.5, '#b0aca0') +
        ellipse(38, 39, 4, 2.8, '#8a8680') +
        ellipse(28, 37, 3, 2.2, '#c0bcb0') +
        ellipse(35, 43, 2.8, 2, '#a8a498') +
        circle(23, 39, 0.8, '#d8d4c8', 'opacity="0.5"')
      );
    },

    stepping_stones() {
      return (
        ellipse(32, 44, 16, 7, '#5a6a58', 'opacity="0.2"') +
        ellipse(20, 40, 9, 5, '#b8b0a0') +
        ellipse(36, 36, 10, 5.5, '#c8c0b0') +
        ellipse(30, 46, 8, 4.5, '#a8a090') +
        ellipse(18, 38, 2, 1, '#e0d8c8', 'opacity="0.45"') +
        ellipse(34, 34, 2.5, 1.2, '#e8e0d0', 'opacity="0.4"')
      );
    },

    moss_patch() {
      return (
        ellipse(32, 42, 18, 9, '#4a7a48', 'opacity="0.55"') +
        ellipse(26, 40, 8, 5, '#5a9a58', 'opacity="0.7"') +
        ellipse(38, 42, 7, 4.5, '#6aaa68', 'opacity="0.65"') +
        ellipse(32, 38, 6, 4, '#7aba78', 'opacity="0.5"') +
        circle(28, 39, 1.2, '#90c888', 'opacity="0.6"') +
        circle(36, 41, 1, '#a0d090', 'opacity="0.5"')
      );
    },

    bench() {
      return (
        ellipse(32, 52, 16, 5, '#3d5a38', 'opacity="0.3"') +
        rect(14, 36, 36, 6, '#8b6239', 1) +
        rect(14, 34, 36, 3, '#a87848', 1) +
        rect(16, 42, 5, 10, '#6f4a28', 1) +
        rect(43, 42, 5, 10, '#6f4a28', 1) +
        rect(18, 28, 3, 8, '#7a5535', 1) +
        rect(43, 28, 3, 8, '#7a5535', 1) +
        rect(17, 26, 30, 4, '#9a7045', 1) +
        rect(17, 25, 30, 2, '#b88858', 1)
      );
    },

    lantern() {
      return (
        ellipse(32, 54, 8, 3, '#3d5a38', 'opacity="0.28"') +
        rect(30, 40, 4, 14, '#5a4030', 1) +
        rect(24, 26, 16, 16, '#4a3828', 2) +
        rect(26, 28, 12, 12, '#f0c060', 1) +
        rect(26, 28, 12, 12, '#fff0b0', 1, 'opacity="0.45"') +
        rect(28, 22, 8, 5, '#5a4030', 1) +
        path('M28 22 Q32 16 36 22', 'fill="none" stroke="#5a4030" stroke-width="2" stroke-linecap="round"') +
        circle(32, 34, 2.5, '#ffe8a0', 'opacity="0.85"')
      );
    },

    flower_pot() {
      return (
        ellipse(32, 54, 10, 3.5, '#3d5a38', 'opacity="0.25"') +
        path('M22 40 L26 54 L38 54 L42 40 Z', 'fill="#c47848"') +
        path('M22 40 L26 54 L38 54 L42 40 Z', 'fill="#a86038" opacity="0.35"') +
        rect(20, 36, 24, 6, '#d48858', 1) +
        rect(20, 36, 24, 3, '#e09868', 1) +
        ellipse(32, 30, 3, 8, '#4a8a40') +
        circle(26, 26, 4, '#e87898') +
        circle(38, 24, 4, '#f090a8') +
        circle(32, 22, 3.5, '#f8a0b8') +
        circle(28, 24, 1.2, '#fff0f4', 'opacity="0.5"')
      );
    },

    fence() {
      // Standalone fence segment (posts + rails) — connectors bridge gaps between tiles
      return (
        ellipse(32, 54, 18, 4, '#3d5a38', 'opacity="0.22"') +
        rect(12, 28, 5, 26, '#8b6239', 1) +
        rect(47, 28, 5, 26, '#8b6239', 1) +
        rect(14, 34, 36, 4, '#a87848', 1) +
        rect(14, 44, 36, 4, '#a87848', 1) +
        rect(14, 33, 36, 2, '#c09060', 1) +
        rect(14, 43, 36, 2, '#c09060', 1)
      );
    },

    fence_connector() {
      // Rails spanning the gap between two adjacent fence tiles
      return (
        rect(4, 26, 56, 4, '#a87848', 1) +
        rect(4, 36, 56, 4, '#a87848', 1) +
        rect(4, 25, 56, 2, '#c09060', 1) +
        rect(4, 35, 56, 2, '#c09060', 1) +
        rect(30, 24, 4, 20, '#8b6239', 1)
      );
    },

    birdhouse() {
      return (
        ellipse(32, 54, 8, 3, '#3d5a38', 'opacity="0.25"') +
        rect(30, 38, 4, 16, '#7a5535', 1) +
        rect(20, 22, 24, 18, '#d4a06a', 2) +
        path('M18 24 L32 12 L46 24 Z', 'fill="#c45a3a"') +
        circle(32, 30, 4, '#5a4030') +
        rect(28, 36, 8, 3, '#8b6239', 1) +
        circle(34, 28, 1, '#e8d4a8', 'opacity="0.4"')
      );
    },

    picnic_blanket() {
      return (
        ellipse(32, 44, 20, 10, '#3d5a38', 'opacity="0.15"') +
        path('M14 36 L28 28 L50 34 L36 48 Z', 'fill="#e87878"') +
        path('M14 36 L28 28 L50 34 L36 48 Z', 'fill="#f09090" opacity="0.35"') +
        path('M20 38 L30 32 L40 36 L30 44 Z', 'fill="#f8f0e0" opacity="0.35"') +
        path('M24 34 L34 30', 'stroke="#fff8f0" stroke-width="1.2" opacity="0.5"') +
        path('M22 40 L38 34', 'stroke="#fff8f0" stroke-width="1.2" opacity="0.4"')
      );
    },

    stump() {
      return (
        ellipse(32, 50, 14, 5, '#3d5a38', 'opacity="0.28"') +
        ellipse(32, 42, 14, 8, '#8b6239') +
        ellipse(32, 38, 14, 7, '#a87848') +
        ellipse(32, 36, 11, 5, '#c49868') +
        ellipse(32, 36, 7, 3, '#d4b088', 'opacity="0.7"') +
        ellipse(32, 36, 3, 1.5, '#e8d0a8', 'opacity="0.5"') +
        path('M20 40 Q18 44 20 48', 'fill="none" stroke="#6f4a28" stroke-width="1.5" opacity="0.5"')
      );
    },

    mushroom_stool() {
      return (
        ellipse(32, 52, 12, 4, '#3d5a38', 'opacity="0.25"') +
        rect(28, 36, 8, 14, '#e8d8b8', 2) +
        ellipse(32, 34, 16, 10, '#e87868') +
        ellipse(32, 32, 14, 8, '#f09080') +
        circle(26, 30, 2.2, '#fff0e8', 'opacity="0.7"') +
        circle(34, 28, 1.8, '#fff0e8', 'opacity="0.55"') +
        circle(38, 34, 1.5, '#fff0e8', 'opacity="0.45"')
      );
    },

    campfire() {
      return (
        ellipse(32, 52, 14, 5, '#3d5a38', 'opacity="0.25"') +
        ellipse(24, 46, 5, 3, '#8a8680') +
        ellipse(40, 46, 5, 3, '#9a9688') +
        ellipse(32, 48, 6, 3.5, '#7a7670') +
        path('M32 44 Q28 34 30 24 Q32 30 34 24 Q36 34 32 44 Z', 'fill="#f0a040"') +
        path('M32 42 Q30 34 31 28 Q32 32 33 28 Q34 34 32 42 Z', 'fill="#ffe080"') +
        path('M26 44 L22 38', 'stroke="#6f4a28" stroke-width="2.5" stroke-linecap="round"') +
        path('M38 44 L42 38', 'stroke="#6f4a28" stroke-width="2.5" stroke-linecap="round"')
      );
    },

    signpost() {
      // Note: rect() 6th arg is rx — opacity must be 7th
      return (
        ellipse(32, 54, 9, 3.5, '#3d5a38', 'opacity="0.28"') +
        rect(29, 26, 6, 28, '#7a5535', 1) +
        rect(14, 18, 32, 16, '#d4a06a', 2) +
        rect(14, 18, 32, 5, '#e0b888', 2) +
        rect(18, 28, 14, 2.5, '#8b6239', 0, 'opacity="0.4"') +
        rect(18, 32, 10, 2.5, '#8b6239', 0, 'opacity="0.35"') +
        path('M46 26 L52 22 L52 30 Z', 'fill="#c09060"')
      );
    },

    watering_can() {
      return (
        ellipse(32, 50, 12, 4, '#3d5a38', 'opacity="0.22"') +
        path('M20 34 Q18 28 24 26 L40 26 Q46 28 44 36 L42 44 Q32 48 22 44 Z', 'fill="#6a9ab0"') +
        path('M20 34 Q18 28 24 26 L40 26 Q46 28 44 36 L42 44 Q32 48 22 44 Z', 'fill="#8ab8c8" opacity="0.35"') +
        path('M40 30 Q52 28 54 36', 'fill="none" stroke="#5a8a9a" stroke-width="3" stroke-linecap="round"') +
        path('M24 26 Q28 18 36 26', 'fill="none" stroke="#5a8a9a" stroke-width="2.5" stroke-linecap="round"') +
        circle(28, 36, 1.5, '#c8e4f0', 'opacity="0.5"')
      );
    },

    // Tool icons (also SVG, no emoji)
    tool_fertilizer() {
      return (
        ellipse(32, 52, 12, 4, '#3d5a38', 'opacity="0.2"') +
        path('M22 40 L26 20 L38 20 L42 40 Z', 'fill="#6a8a48"') +
        path('M22 40 L42 40 L40 48 L24 48 Z', 'fill="#8a6239"') +
        circle(28, 28, 2, '#c8a060') +
        circle(34, 30, 1.8, '#a87840') +
        circle(30, 34, 1.5, '#d4b070')
      );
    },

    tool_remove() {
      return (
        ellipse(32, 52, 10, 3.5, '#3d5a38', 'opacity="0.2"') +
        rect(28, 18, 8, 22, '#8a9aa8', 1) +
        rect(26, 38, 12, 8, '#5a4030', 2) +
        path('M24 22 L40 22', 'stroke="#c8d0d8" stroke-width="2"') +
        path('M26 28 L38 28', 'stroke="#b0b8c0" stroke-width="1.5"')
      );
    },
  };

  const displaySize = {
    path_dirt: 42,
    path_dirt_connector: 28,
    path_stone: 42,
    path_stone_connector: 28,
    pebbles: 30,
    stepping_stones: 36,
    moss_patch: 34,
    bench: 44,
    lantern: 42,
    flower_pot: 40,
    fence: 42,
    fence_connector: 40,
    birdhouse: 42,
    picnic_blanket: 40,
    stump: 38,
    mushroom_stool: 40,
    campfire: 40,
    signpost: 44,
    watering_can: 38,
  };

  const cache = {};

  function resolveDecorSVGPath(type) {
    // Always rebuild if previously cached empty/broken
    if (cache[type]) return cache[type];
    const draw = artists[type];
    if (!draw) return '';
    const uri = toDataUri(wrap(draw()));
    cache[type] = uri;
    return uri;
  }

  /** Clear cached sprites (e.g. after hot-reload of art). */
  function clearCache(type) {
    if (type) delete cache[type];
    else Object.keys(cache).forEach((k) => delete cache[k]);
  }

  function resolveDecorDisplaySize(type) {
    return displaySize[type] || 36;
  }

  function getDecorTypes() {
    return Object.keys(artists).filter((k) => !k.startsWith('tool_') && !k.endsWith('_connector'));
  }

  return {
    resolveDecorSVGPath,
    resolveDecorDisplaySize,
    getDecorTypes,
    clearCache,
    toolIcon(name) {
      return resolveDecorSVGPath(name.startsWith('tool_') ? name : `tool_${name}`);
    },
  };
})();

window.DecorRenderer = DecorRenderer;
