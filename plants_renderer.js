// =============================================
// StudyLoop — plants_renderer.js
// Plant & game asset path resolver
// =============================================

const PlantRenderer = {
  /** PNG / special game assets (not stage SVG folders) */
  gameAssets: {
    tree_sapling: 'assets/game/tree.png',
  },

  /**
   * Resolves the asset path for a given plant type and growth stage.
   * @param {string} plantType
   * @param {number} stage - 0 to 4
   * @returns {string}
   */
  resolvePlantSVGPath(plantType, stage) {
    if (this.gameAssets[plantType]) return this.gameAssets[plantType];

    const validTypes = ['sprout_flower', 'sunflower', 'cactus', 'rose_bush', 'tree_sapling'];
    const type = validTypes.includes(plantType) ? plantType : 'sprout_flower';
    const normalizedStage = Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
    return `assets/plants/${type}/${normalizedStage}.svg`;
  },

  /** Display size (px) for a planted sprite on the island canvas */
  resolvePlantDisplaySize(plantType, stage) {
    const s = Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
    if (plantType === 'tree_sapling') return 36 + s * 16;
    return 28 + s * 6;
  },

  isGameAsset(plantType) {
    return Boolean(this.gameAssets[plantType]);
  },
};

window.PlantRenderer = PlantRenderer;
