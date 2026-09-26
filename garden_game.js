// =============================================
// StudyLoop — garden_game.js
// Collaborative Garden Game Logic
// =============================================

const GardenGame = {
  // Config (Dev vs Prod settings)
  config: {
    isDev: true, // Toggle for testing vs production
    get wiltTimeout() { return this.isDev ? 120 : 7200; }, // 2 minutes in dev, 2 hours in prod
    get waterLimit() { return this.isDev ? 10 : 600; },    // 10 seconds in dev, 10 minutes in prod
    grid: { colMin: -14, colMax: 14, rowMin: -12, rowMax: 14 },
    plants: {
      sprout_flower: { name: 'Sprout', cost: 10, growTime: 120, boost: 30, desc: 'Cheap starter' },
      sunflower:     { name: 'Sunflower', cost: 25, growTime: 300, boost: 75, desc: 'Tall bloom' },
      cactus:        { name: 'Cactus', cost: 15, growTime: 600, boost: 150, desc: 'Low water' },
      rose_bush:     { name: 'Rose', cost: 40, growTime: 480, boost: 120, desc: 'Red bush' },
      tree_sapling:  { name: 'Tree', cost: 75, growTime: 1200, boost: 300, desc: 'Fruit tree' }
    }
  },

  render: {
    viewW: 1024,
    viewH: 1024,
    hexRadius: 20,
    originX: 512,
    originY: 430,
    islandSrc: 'island.png',
    landCenterX: 512,
    landCenterY: 512,
    landRadiusX: 395,
    landRadiusY: 362,
  },

  camera: {
    centerX: 512,
    centerY: 520,
    zoom: 1,
    minZoom: 0.75,
    maxZoom: 2.75,
  },

  pan: {
    active: false,
    didDrag: false,
    lastX: 0,
    lastY: 0,
    pointerId: null,
  },

  pinch: {
    active: false,
  },

  // State
  state: {
    garden: null,
    plots: [], // 2D array coordinates mapping to database plots
    plantsMap: {}, // plotId -> plant object
    selectedSeed: null, // plant_type key if selected
    isConnecting: false,
    isStarted: false,
    channels: [],
    growthIntervalId: null
  },

  // DOM Elements cache
  els: {},

  init() {
    console.log('GardenGame: Initializing...');
    this.els.myPoints = document.getElementById('garden-my-points');
    this.els.partnerPoints = document.getElementById('garden-partner-points');
    this.els.connDot = document.getElementById('garden-conn-dot');
    this.els.connText = document.getElementById('garden-conn-text');
    this.els.helperText = document.getElementById('garden-helper-text');
    this.els.svg = document.getElementById('garden-svg');
    this.els.shopList = document.getElementById('shop-seeds-list');
    this.els.overlay = document.getElementById('garden-loading-overlay');
    this.els.frame = document.querySelector('.game-viewport__frame');

    if (!this.els.svg) {
      console.warn('GardenGame: Garden UI elements not found. Skipping initialization.');
      return;
    }

    this.setupCameraControls();
    this.setupShop();
    this.applyViewBox();
    this.renderEmptyGrid();
  },

  clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  },

  clampCameraCenter() {
    const { viewW, viewH } = this.render;
    const visW = viewW / this.camera.zoom;
    const visH = viewH / this.camera.zoom;
    let minX = visW / 2;
    let maxX = viewW - visW / 2;
    let minY = visH / 2;
    let maxY = viewH - visH / 2;
    if (minX > maxX) minX = maxX = viewW / 2;
    if (minY > maxY) minY = maxY = viewH / 2;
    this.camera.centerX = this.clamp(this.camera.centerX, minX, maxX);
    this.camera.centerY = this.clamp(this.camera.centerY, minY, maxY);
  },

  applyViewBox() {
    if (!this.els.svg) return;
    const { viewW, viewH } = this.render;
    this.clampCameraCenter();
    const visW = viewW / this.camera.zoom;
    const visH = viewH / this.camera.zoom;
    const x = this.camera.centerX - visW / 2;
    const y = this.camera.centerY - visH / 2;
    this.els.svg.setAttribute('viewBox', `${x} ${y} ${visW} ${visH}`);
  },

  clientToWorld(clientX, clientY) {
    const svg = this.els.svg;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: this.camera.centerX, y: this.camera.centerY };
    return pt.matrixTransform(ctm.inverse());
  },

  zoomAtClient(clientX, clientY, factor) {
    const before = this.clientToWorld(clientX, clientY);
    this.camera.zoom = this.clamp(
      this.camera.zoom * factor,
      this.camera.minZoom,
      this.camera.maxZoom
    );
    this.applyViewBox();
    const after = this.clientToWorld(clientX, clientY);
    this.camera.centerX += before.x - after.x;
    this.camera.centerY += before.y - after.y;
    this.applyViewBox();
  },

  panByScreenDelta(dx, dy) {
    const svg = this.els.svg;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    this.camera.centerX -= dx * scaleX;
    this.camera.centerY -= dy * scaleY;
    this.applyViewBox();
  },

  setupCameraControls() {
    if (this._cameraBound || !this.els.svg) return;
    this._cameraBound = true;

    const frame = this.els.frame || this.els.svg.closest('.game-viewport__frame');
    const svg = this.els.svg;
    const gameRoot = frame?.closest('.garden-game-root');

    const preventScrollZoom = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomAtClient(e.clientX, e.clientY, factor);
    };

    frame.addEventListener('wheel', preventScrollZoom, { passive: false });
    if (gameRoot && gameRoot !== frame) {
      gameRoot.addEventListener('wheel', preventScrollZoom, { passive: false });
    }

    svg.addEventListener('pointerdown', (e) => this.onCameraPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.onCameraPointerMove(e));
    svg.addEventListener('pointerup', (e) => this.onCameraPointerUp(e));
    svg.addEventListener('pointercancel', (e) => this.onCameraPointerUp(e));

    // Pinch-to-zoom on touch devices
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    frame.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.pinch.active = true;
        this.pan.active = false;
        this.els.svg.classList.remove('is-panning');
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartZoom = this.camera.zoom;
      }
    }, { passive: true });

    frame.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !pinchStartDist) return;
      e.preventDefault();
      this.pinch.active = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const targetZoom = this.clamp(
        pinchStartZoom * (dist / pinchStartDist),
        this.camera.minZoom,
        this.camera.maxZoom
      );
      const factor = targetZoom / this.camera.zoom;
      this.zoomAtClient(midX, midY, factor);
    }, { passive: false });

    frame.addEventListener('touchend', () => {
      pinchStartDist = 0;
      this.pinch.active = false;
    });
  },

  onCameraPointerDown(e) {
    if (e.button !== 0 || this.pinch.active) return;
    this.pan.active = true;
    this.pan.didDrag = false;
    this.pan.lastX = e.clientX;
    this.pan.lastY = e.clientY;
    this.pan.pointerId = e.pointerId;
    this.els.svg.classList.add('is-panning');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no-op */ }
  },

  onCameraPointerMove(e) {
    if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;
    const dx = e.clientX - this.pan.lastX;
    const dy = e.clientY - this.pan.lastY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) this.pan.didDrag = true;
    if (this.pan.didDrag) {
      this.panByScreenDelta(dx, dy);
      this.pan.lastX = e.clientX;
      this.pan.lastY = e.clientY;
    }
  },

  onCameraPointerUp(e) {
    if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;
    this.els.svg.classList.remove('is-panning');
    if (!this.pan.didDrag) {
      // pointer capture retargets pointerup to the SVG — use world coords, not e.target
      this.handlePlotClickAtClient(e.clientX, e.clientY);
    }
    this.pan.active = false;
    this.pan.pointerId = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
  },

  handlePlotClickAtClient(clientX, clientY) {
    const { x, y } = this.clientToWorld(clientX, clientY);
    const hit = this.resolvePlotAtWorld(x, y);
    if (!hit) return;

    const plot = this.state.plots.find(p => p.plot_x === hit.c && p.plot_y === hit.r);
    const plant = plot ? this.state.plantsMap[plot.id] : null;
    this.handlePlotClick(hit.c, hit.r, plot, plant);
  },

  async start() {
    if (this.state.isConnecting) return;
    // If already started, just refresh points & canvas
    if (this.state.isStarted && this.state.garden) {
      await this.loadPoints();
      this.setupShop();
      this.renderGardenCanvas();
      return;
    }
    this.state.isConnecting = true;
    this.updateConnectionStatus('connecting', 'Connecting to garden...');
    this.showOverlay(true);

    try {
      await this.loadPoints();
      await this.loadOrCreateGarden();
      await this.loadGardenState();
      this.subscribeRealtime();
      this.renderGardenCanvas();
      this.updateConnectionStatus('online', 'Online');
      this.state.isStarted = true;

      // Start auto-render loop for live growth updates (every 5s)
      if (this.state.growthIntervalId) clearInterval(this.state.growthIntervalId);
      this.state.growthIntervalId = setInterval(() => {
        if (this.state.garden) this.renderGardenCanvas();
      }, 5000);
    } catch (err) {
      console.error('GardenGame start error:', err);
      this.updateConnectionStatus('offline', 'Connection error. Retrying...');
    } finally {
      this.showOverlay(false);
      this.state.isConnecting = false;
    }
  },

  stop() {
    // Clear growth render loop
    if (this.state.growthIntervalId) {
      clearInterval(this.state.growthIntervalId);
      this.state.growthIntervalId = null;
    }
    // Unsubscribe channels
    this.state.channels.forEach(ch => {
      try { window.sb.removeChannel(ch); } catch (e) {}
    });
    this.state.channels = [];
    this.state.garden = null;
    this.state.plots = [];
    this.state.plantsMap = {};
    this.state.selectedSeed = null;
    this.state.isStarted = false;
    this.updateConnectionStatus('offline', 'Disconnected');
  },

  updateConnectionStatus(status, text) {
    if (!this.els.connDot || !this.els.connText) return;
    this.els.connText.textContent = text;
    this.els.connDot.className = 'game-hud__status-dot';

    if (status === 'online') {
      this.els.connDot.classList.add('game-hud__status-dot--online');
    } else if (status === 'connecting') {
      this.els.connDot.classList.add('game-hud__status-dot--connecting');
    } else {
      this.els.connDot.classList.add('game-hud__status-dot--offline');
    }
  },

  showOverlay(show) {
    if (!this.els.overlay) return;
    this.els.overlay.classList.toggle('hidden', !show);
  },

  async loadPoints() {
    // Sync own points display
    if (window.userProfile) {
      if (this.els.myPoints) this.els.myPoints.textContent = window.userProfile.total_task_points ?? 0;
    }
    // Sync partner points display
    if (window.partnerProfile) {
      if (this.els.partnerPoints) this.els.partnerPoints.textContent = window.partnerProfile.total_task_points ?? 0;
    }
  },

  async loadOrCreateGarden() {
    if (!window.currentUser || !window.partnerProfile) {
      throw new Error('User or Partner profile not loaded');
    }

    const uids = [window.currentUser.id, window.partnerProfile.id].sort();
    
    // Check if garden exists
    const { data: existing, error } = await window.sb
      .from('gardens')
      .select('*')
      .eq('player_a_id', uids[0])
      .eq('player_b_id', uids[1])
      .maybeSingle();

    if (error) throw error;

    if (existing) {
      this.state.garden = existing;
    } else {
      // Create new shared garden
      const { data: created, error: createErr } = await window.sb
        .from('gardens')
        .insert({ player_a_id: uids[0], player_b_id: uids[1] })
        .select()
        .single();
      if (createErr) throw createErr;
      this.state.garden = created;
    }
  },

  async loadGardenState() {
    if (!this.state.garden) return;

    // Load plots
    const { data: plotsData, error: plotsErr } = await window.sb
      .from('garden_plots')
      .select('*')
      .eq('garden_id', this.state.garden.id);

    if (plotsErr) throw plotsErr;

    // Load plants
    const plotIds = (plotsData || []).map(p => p.id);
    let plantsData = [];
    if (plotIds.length > 0) {
      const { data: plData, error: plErr } = await window.sb
        .from('garden_plants')
        .select('*')
        .in('plot_id', plotIds);
      if (plErr) throw plErr;
      plantsData = plData || [];
    }

    // Build models
    this.state.plots = plotsData || [];
    this.state.plantsMap = {};
    plantsData.forEach(p => {
      this.state.plantsMap[p.plot_id] = p;
    });

    this.setupShop(); // Refresh buttons based on points
  },

  subscribeRealtime() {
    if (!this.state.garden) return;

    // Remove existing channels
    this.state.channels.forEach(ch => {
      try { window.sb.removeChannel(ch); } catch (e) {}
    });
    this.state.channels = [];

    // Channel for garden plots & plants, scoped to this garden
    const gardenChannel = window.sb
      .channel(`garden-${this.state.garden.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'garden_plots',
        filter: `garden_id=eq.${this.state.garden.id}`
      }, async (payload) => {
        console.log('Realtime plot update:', payload);
        await this.loadGardenState();
        this.renderGardenCanvas();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'garden_plants'
      }, async (payload) => {
        console.log('Realtime plant update:', payload);
        await this.loadGardenState();
        this.renderGardenCanvas();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users'
      }, (payload) => {
        const u = payload.new;
        if (window.currentUser && u.id === window.currentUser.id) {
          window.userProfile.total_task_points = u.total_task_points;
          this.loadPoints();
          this.setupShop();
        } else if (window.partnerProfile && u.id === window.partnerProfile.id) {
          window.partnerProfile.total_task_points = u.total_task_points;
          this.loadPoints();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateConnectionStatus('online', 'Online');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.updateConnectionStatus('offline', 'Reconnecting...');
        }
      });

    this.state.channels.push(gardenChannel);
  },

  setupShop() {
    if (!this.els.shopList) return;
    this.els.shopList.innerHTML = '';
    const myPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;

    Object.entries(this.config.plants).forEach(([key, p]) => {
      const card = document.createElement('button');
      card.type = 'button';
      const affordable = myPoints >= p.cost;
      card.className = `game-hotbar-slot ${!affordable ? 'disabled' : ''} ${this.state.selectedSeed === key ? 'selected' : ''}`;
      card.dataset.seed = key;
      card.title = `${p.name} — ${p.cost} pts`;

      const iconPath = window.PlantRenderer.resolvePlantSVGPath(key, 4);

      card.innerHTML = `
        <div class="game-hotbar-slot__icon${key === 'tree_sapling' ? ' game-hotbar-slot__icon--asset' : ''}">
          <img src="${iconPath}" alt="${p.name}" />
        </div>
        <span class="game-hotbar-slot__cost">${p.cost} pts</span>
        <span class="game-hotbar-slot__name">${p.name}</span>
      `;

      if (affordable) {
        card.addEventListener('click', () => this.selectSeed(key));
      }

      this.els.shopList.appendChild(card);
    });
  },

  selectSeed(key) {
    if (this.state.selectedSeed === key) {
      this.state.selectedSeed = null;
    } else {
      this.state.selectedSeed = key;
    }

    const cards = this.els.shopList.querySelectorAll('.game-hotbar-slot');
    cards.forEach(c => {
      c.classList.toggle('selected', c.dataset.seed === this.state.selectedSeed);
    });

    this.setHelperText(this.defaultHelperText());
    this.renderGardenCanvas();
  },

  defaultHelperText() {
    if (this.state.selectedSeed) {
      return `🌱 ${this.config.plants[this.state.selectedSeed].name} equipped — click soil to plant!`;
    }
    return 'Scroll to zoom · Drag to move · Hover soil for info';
  },

  setHelperText(text) {
    if (this.els.helperText) this.els.helperText.textContent = text;
  },

  /** True when point is on island land (not water / off-island). */
  isOnLand(x, y) {
    const { landCenterX, landCenterY, landRadiusX, landRadiusY } = this.render;
    const dx = (x - landCenterX) / landRadiusX;
    const dy = (y - landCenterY) / landRadiusY;
    return dx * dx + dy * dy <= 1;
  },

  /** House + pine trees — not plantable. */
  isInHouseZone(x, y) {
    if (x >= 130 && x < 272 && y >= 235 && y <= 415) return true;
    if (x >= 268 && x <= 460 && y >= 235 && y <= 385) return true;
    return false;
  },

  isFarmable(x, y) {
    return this.isOnLand(x, y) && !this.isInHouseZone(x, y);
  },

  hexToScreen(col, row) {
    const r = this.render.hexRadius;
    const w = Math.sqrt(3) * r;
    const vert = 2 * r * 0.75;
    const cx = this.render.originX + col * w + (row & 1 ? w / 2 : 0);
    const cy = this.render.originY + row * vert;
    return { x: cx, y: cy };
  },

  /** Pick farmable hex from world coords (handles clicks on plant sprites above soil). */
  resolvePlotAtWorld(x, y) {
    const now = new Date();
    const hexR = this.render.hexRadius;
    const soilHitDist = (hexR * 1.15) ** 2;

    for (const tile of this.getFarmableHexTiles()) {
      const plot = this.state.plots.find(p => p.plot_x === tile.c && p.plot_y === tile.r);
      const plant = plot ? this.state.plantsMap[plot.id] : null;
      if (!plot || !plant) continue;

      const stage = this.calculatePlantStage(plant, now);
      const size = window.PlantRenderer.resolvePlantDisplaySize(plant.plant_type, stage);
      const isTree = window.PlantRenderer.isGameAsset(plant.plant_type);
      const spriteTop = tile.cy - size + (isTree ? 6 : 4);
      const spriteBottom = tile.cy + 6;
      const spriteLeft = tile.cx - size / 2 - 4;
      const spriteRight = tile.cx + size / 2 + 4;

      if (x >= spriteLeft && x <= spriteRight && y >= spriteTop && y <= spriteBottom) {
        return { c: tile.c, r: tile.r };
      }
    }

    let best = null;
    let bestDist = Infinity;
    for (const tile of this.getFarmableHexTiles()) {
      const dx = x - tile.cx;
      const dy = y - tile.cy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = tile;
      }
    }

    if (best && bestDist <= soilHitDist) return { c: best.c, r: best.r };
    return null;
  },

  hexPoints(cx, cy) {
    const r = this.render.hexRadius;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return pts.join(' ');
  },

  getFarmableHexTiles() {
    if (this._farmableHexCache) return this._farmableHexCache;

    const { colMin, colMax, rowMin, rowMax } = this.config.grid;
    const tiles = [];

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const { x: cx, y: cy } = this.hexToScreen(col, row);
        if (this.isFarmable(cx, cy)) {
          tiles.push({ c: col, r: row, cx, cy, sort: cy * 1000 + cx });
        }
      }
    }

    tiles.sort((a, b) => a.sort - b.sort);
    this._farmableHexCache = tiles;
    return tiles;
  },

  ensureSceneDefs(svg) {
    if (svg.querySelector('#game-scene-defs')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.setAttribute('id', 'game-scene-defs');

    defs.innerHTML = `
      <filter id="game-plant-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1a1208" flood-opacity="0.45"/>
      </filter>
      <filter id="game-soil-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;

    svg.appendChild(defs);
  },

  drawSceneBackground(parent) {
    const { viewW, viewH, islandSrc } = this.render;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bg.setAttribute('class', 'game-scene-island');

    const island = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    island.setAttribute('href', islandSrc);
    island.setAttribute('x', 0);
    island.setAttribute('y', 0);
    island.setAttribute('width', viewW);
    island.setAttribute('height', viewH);
    island.setAttribute('preserveAspectRatio', 'none');
    bg.appendChild(island);

    parent.appendChild(bg);
  },

  buildPlotHitArea(cx, cy) {
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.setAttribute('points', this.hexPoints(cx, cy));
    hit.setAttribute('class', 'game-plot-tile__hit');
    return hit;
  },

  renderScene(includeInteractions = false) {
    if (!this.els.svg) return;

    let world = this.els.svg.querySelector('#game-world');
    if (!world) {
      this.els.svg.innerHTML = '';
      this.ensureSceneDefs(this.els.svg);
      world = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      world.setAttribute('id', 'game-world');
      this.els.svg.appendChild(world);
      this.drawSceneBackground(world);
    }

    const existingLayer = world.querySelector('#game-plot-layer');
    if (existingLayer) existingLayer.remove();

    const plotLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    plotLayer.setAttribute('id', 'game-plot-layer');
    world.appendChild(plotLayer);

    const now = new Date();
    const myLetter = window.userProfile ? (window.userProfile.display_name || 'M').charAt(0).toUpperCase() : 'Y';
    const partnerLetter = window.partnerProfile ? (window.partnerProfile.display_name || 'P').charAt(0).toUpperCase() : 'P';

    this.getFarmableHexTiles().forEach(({ c, r, cx, cy }) => {
      const plot = this.state.plots.find(p => p.plot_x === c && p.plot_y === r);
      const plant = plot ? this.state.plantsMap[plot.id] : null;
      const hasPlant = !!(plot && plant);

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'game-plot-tile');
      group.setAttribute('data-col', c);
      group.setAttribute('data-row', r);
      if (this.state.selectedSeed && !hasPlant) {
        group.classList.add('game-plot-tile--selected');
      }
      if (hasPlant) group.classList.add('game-plot-tile--planted');

      group.appendChild(this.buildPlotHitArea(cx, cy));

      if (hasPlant) {
        const stage = this.calculatePlantStage(plant, now);
        const wilted = this.isPlantWilted(plant, now);
        const iconPath = window.PlantRenderer.resolvePlantSVGPath(plant.plant_type, stage);
        const size = window.PlantRenderer.resolvePlantDisplaySize(plant.plant_type, stage);
        const isTree = window.PlantRenderer.isGameAsset(plant.plant_type);
        const spriteTop = cy - size + (isTree ? 6 : 4);
        const spriteLeft = cx - size / 2 - 4;
        const spriteW = size + 8;
        const spriteH = size + 10;

        const plantHit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        plantHit.setAttribute('x', spriteLeft);
        plantHit.setAttribute('y', spriteTop);
        plantHit.setAttribute('width', spriteW);
        plantHit.setAttribute('height', spriteH);
        plantHit.setAttribute('class', 'game-plot-tile__plant-hit');
        group.appendChild(plantHit);

        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttribute('href', iconPath);
        image.setAttribute('x', cx - size / 2);
        image.setAttribute('y', cy - size + (isTree ? 6 : 4));
        image.setAttribute('width', size);
        image.setAttribute('height', size);
        image.setAttribute('class', `game-plant-sprite${wilted ? ' wilted-plant' : ''}${isTree ? ' game-plant-sprite--asset' : ''}`);
        image.setAttribute('filter', 'url(#game-plant-shadow)');
        group.appendChild(image);

        const isMe = plant.owner_user_id === window.currentUser?.id;
        const ownerInitial = isMe ? myLetter : partnerLetter;

        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badge.setAttribute('class', 'game-owner-badge');
        badge.setAttribute('transform', `translate(${cx + 18}, ${cy - 8})`);

        const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        badgeBg.setAttribute('x', -8);
        badgeBg.setAttribute('y', -8);
        badgeBg.setAttribute('width', 16);
        badgeBg.setAttribute('height', 16);
        badgeBg.setAttribute('class', 'game-owner-badge__bg');

        const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badgeText.setAttribute('class', 'game-owner-badge__text');
        badgeText.textContent = ownerInitial;

        badge.appendChild(badgeBg);
        badge.appendChild(badgeText);
        group.appendChild(badge);

        if (includeInteractions) {
          group.addEventListener('mouseenter', () => {
            const lastWateredText = plant.last_watered_at
              ? `${Math.round((Date.now() - new Date(plant.last_watered_at).getTime()) / 1000 / 60)}m ago`
              : 'Never';
            const stages = ['Seed', 'Sprout', 'Growing', 'Mature', 'Bloom'];
            const plantName = this.config.plants[plant.plant_type]?.name || plant.plant_type;
            this.setHelperText(
              `${plantName} · ${isMe ? 'You' : 'Partner'} · ${stages[stage]}${wilted ? ' · WILTED! Click to water' : ' · Click to water'} · Last: ${lastWateredText}`
            );
          });
        }
      } else if (includeInteractions) {
        group.addEventListener('mouseenter', () => {
          this.setHelperText(
            this.state.selectedSeed
              ? `Empty soil (${c},${r}) — click to plant ${this.config.plants[this.state.selectedSeed].name}!`
              : `Empty soil (${c},${r}) — pick a seed from toolbar first`
          );
        });
      }

      if (includeInteractions) {
        group.addEventListener('mouseleave', () => this.setHelperText(this.defaultHelperText()));
      }

      plotLayer.appendChild(group);
    });
  },

  renderEmptyGrid() {
    this.renderScene(false);
  },

  renderGardenCanvas() {
    this.renderScene(true);
  },

  // Growth & Wilt calculations
  calculatePlantStage(plant, now = new Date()) {
    const config = this.config.plants[plant.plant_type];
    if (!config) return 0;

    const plantedAt = new Date(plant.planted_at).getTime();
    const elapsedSeconds = Math.max(0, (now.getTime() - plantedAt) / 1000);
    const boostSeconds = (plant.water_boosts || 0) * config.boost;

    const effectiveSeconds = elapsedSeconds + boostSeconds;
    const stageDuration = config.growTime / 4;

    const stage = Math.floor(effectiveSeconds / stageDuration);
    return Math.min(4, Math.max(0, stage));
  },

  isPlantWilted(plant, now = new Date()) {
    const stage = this.calculatePlantStage(plant, now);
    if (stage === 4) return false; // Bloom stage cannot wilt

    const lastWatered = new Date(plant.last_watered_at || plant.planted_at).getTime();
    const secondsSinceWater = (now.getTime() - lastWatered) / 1000;

    return secondsSinceWater > this.config.wiltTimeout;
  },

  async handlePlotClick(c, r, plot, plant) {
    if (plot && plant) {
      // Existing plant: WATER action
      await this.waterPlant(plant);
    } else {
      // Empty plot: PLANT action
      await this.plantSeed(c, r);
    }
  },

  async plantSeed(c, r) {
    if (!this.state.selectedSeed) {
      this.toast('Select a seed from the Shop first!', 'warning');
      return;
    }
    const seedType = this.state.selectedSeed;
    const config = this.config.plants[seedType];
    const myPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;

    if (myPoints < config.cost) {
      this.toast('Insufficient points to purchase this seed!', 'error');
      this.state.selectedSeed = null;
      this.setupShop();
      return;
    }

    this.showOverlay(true);
    try {
      // 1. Deduct points first
      const nextPoints = myPoints - config.cost;
      const { error: pointsErr } = await window.sb
        .from('users')
        .update({ total_task_points: nextPoints })
        .eq('id', window.currentUser.id);
      
      if (pointsErr) throw pointsErr;
      window.userProfile.total_task_points = nextPoints;
      this.loadPoints();

      // 2. Insert plot (or upsert if exists but unlinked)
      const { data: newPlot, error: plotErr } = await window.sb
        .from('garden_plots')
        .upsert({ garden_id: this.state.garden.id, plot_x: c, plot_y: r }, { onConflict: 'garden_id,plot_x,plot_y' })
        .select()
        .single();

      if (plotErr) throw plotErr;

      // 3. Insert plant
      const { data: newPlant, error: plantErr } = await window.sb
        .from('garden_plants')
        .insert({
          plot_id: newPlot.id,
          owner_user_id: window.currentUser.id,
          plant_type: seedType,
          growth_stage: 0,
          planted_at: new Date().toISOString(),
          last_watered_at: new Date().toISOString(),
          water_boosts: 0,
          is_wilted: false
        })
        .select()
        .single();

      if (plantErr) throw plantErr;

      // 4. Link plot to plant
      await window.sb
        .from('garden_plots')
        .update({ plant_id: newPlant.id })
        .eq('id', newPlot.id);

      this.toast(`Successfully planted ${config.name}!`, 'success');
      this.state.selectedSeed = null;
      
      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('Planting failed:', err);
      this.toast('Planting failed. Please try again.', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  async waterPlant(plant) {
    const now = Date.now();
    const lastWatered = plant.last_watered_at ? new Date(plant.last_watered_at).getTime() : 0;
    const cooldownMs = this.config.waterLimit * 1000;

    if (now - lastWatered < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastWatered)) / 1000);
      this.toast(`Watering on cooldown! Wait ${remainingSeconds}s.`, 'warning');
      return;
    }

    this.showOverlay(true);
    try {
      const nextBoosts = (plant.water_boosts || 0) + 1;
      const { error } = await window.sb
        .from('garden_plants')
        .update({
          last_watered_at: new Date().toISOString(),
          water_boosts: nextBoosts,
          is_wilted: false
        })
        .eq('id', plant.id);

      if (error) throw error;
      this.toast('Watered plant! Growth accelerated.', 'success');

      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('Watering failed:', err);
      this.toast('Watering failed. Try again.', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  toast(message, type = 'info') {
    console.log(`GardenGame toast [${type}]: ${message}`);
    const alertBar = document.createElement('div');
    alertBar.className = `game-toast game-toast--${type === 'success' || type === 'error' || type === 'warning' ? type : 'info'}`;
    alertBar.textContent = message;
    document.body.appendChild(alertBar);

    requestAnimationFrame(() => alertBar.classList.add('game-toast--visible'));

    setTimeout(() => {
      alertBar.classList.remove('game-toast--visible');
      setTimeout(() => alertBar.remove(), 300);
    }, 2500);
  }
};

window.GardenGame = GardenGame;
