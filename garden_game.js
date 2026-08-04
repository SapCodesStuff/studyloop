// =============================================
// StudyLoop — garden_game.js
// Collaborative Garden Game Logic
//
// Features:
//  · Plant & grow 9 plant types (procedural sprites)
//  · Place cozy décor (paths, furniture, accents) with SVG art
//  · Harvest mature plants for points (golden = 3x)
//  · Watering (co-op watering earns bonus points)
//  · Fertilizer + Pick Up tools
//  · Daily weather (sunny / cloudy / rainy effects)
//  · Daily quests with point rewards
//  · Ambient butterflies when the garden blooms
// =============================================

const GardenGame = {
  // Config (Dev vs Prod settings)
  config: {
    isDev: true, // Toggle for testing vs production
    get wiltTimeout() { return this.isDev ? 120 : 7200; }, // 2 minutes in dev, 2 hours in prod
    get waterLimit() { return this.isDev ? 10 : 600; },    // 10 seconds in dev, 10 minutes in prod
    grid: { colMin: -16, colMax: 16, rowMin: -14, rowMax: 16 },
    goldenChance: 8,          // % chance a planted seed becomes golden
    goldenMultiplier: 3,      // golden plants harvest for 3x points
    coopWaterReward: 1,       // pts for watering a partner's plant
    fertilizer: { cost: 22, boosts: 2, name: 'Fertilizer' },
    decorRefundRate: 0.5, // sell/remove returns half the cost
    plants: {
      sprout_flower: { name: 'Sprout', cost: 28, growTime: 120, boost: 30, harvest: 18, desc: 'Cozy starter' },
      mushroom:      { name: 'Mushroom', cost: 38, growTime: 240, boost: 60, harvest: 24, desc: 'Shady buddy' },
      cactus:        { name: 'Cactus', cost: 48, growTime: 600, boost: 150, harvest: 32, desc: 'Low water' },
      sunflower:     { name: 'Sunflower', cost: 72, growTime: 300, boost: 75, harvest: 48, desc: 'Tall bloom' },
      tulip:         { name: 'Tulip', cost: 88, growTime: 420, boost: 105, harvest: 58, desc: 'Spring classic' },
      lavender:      { name: 'Lavender', cost: 105, growTime: 540, boost: 135, harvest: 70, desc: 'Calm scent' },
      rose_bush:     { name: 'Rose', cost: 125, growTime: 480, boost: 120, harvest: 78, desc: 'Red bush' },
      strawberry:    { name: 'Strawberry', cost: 165, growTime: 900, boost: 225, harvest: 110, desc: 'Sweet crop' },
      tree_sapling:  { name: 'Tree', cost: 220, growTime: 1200, boost: 300, harvest: 155, desc: 'Fruit tree' }
    },
    // Cozy island décor — ground stacks under plants; objects occupy a tile
    decor: {
      path_dirt:       { name: 'Dirt Path', cost: 6, layer: 'ground', desc: 'Soft packed earth' },
      path_stone:      { name: 'Stone Path', cost: 10, layer: 'ground', desc: 'Worn cobbles' },
      pebbles:         { name: 'Pebbles', cost: 5, layer: 'ground', desc: 'Tiny beach stones' },
      stepping_stones: { name: 'Stepping Stones', cost: 12, layer: 'ground', desc: 'Cross the grass' },
      moss_patch:      { name: 'Moss Patch', cost: 8, layer: 'ground', desc: 'Soft green carpet' },
      bench:           { name: 'Bench', cost: 45, layer: 'object', desc: 'Sit and rest' },
      stump:           { name: 'Stump Seat', cost: 28, layer: 'object', desc: 'Rustic stool' },
      mushroom_stool:  { name: 'Mushroom Seat', cost: 36, layer: 'object', desc: 'Whimsical perch' },
      lantern:         { name: 'Lantern', cost: 40, layer: 'object', desc: 'Warm evening glow' },
      flower_pot:      { name: 'Flower Pot', cost: 32, layer: 'object', desc: 'Porch blooms' },
      fence:           { name: 'Fence', cost: 18, layer: 'object', desc: 'Cozy border' },
      birdhouse:       { name: 'Birdhouse', cost: 38, layer: 'object', desc: 'For little visitors' },
      picnic_blanket: { name: 'Picnic Blanket', cost: 30, layer: 'object', desc: 'Afternoon lounging' },
      campfire:        { name: 'Campfire', cost: 50, layer: 'object', desc: 'Crackling warmth' },
      signpost:        { name: 'Signpost', cost: 22, layer: 'object', desc: 'Mark a favorite spot' },
      watering_can:    { name: 'Watering Can', cost: 20, layer: 'object', desc: 'Garden prop' },
    },
  },

  render: {
    viewW: 1024,
    viewH: 1024,
    hexRadius: 20,
    originX: 512,
    originY: 430,
    // Organic coastline — enlarged island
    landPolygon: [
      [512, 32], [595, 41], [681, 64], [760, 107], [829, 167],
      [882, 239], [921, 319], [948, 404], [958, 497], [948, 587],
      [919, 668], [872, 737], [810, 798], [734, 843], [648, 873],
      [556, 890], [470, 886], [388, 864], [311, 827], [245, 774],
      [193, 708], [156, 629], [137, 543], [140, 457], [166, 378],
      [212, 305], [278, 243], [358, 193], [437, 154], [480, 94],
      [496, 55],
    ],
  },

  camera: {
    centerX: 512,
    centerY: 480,
    zoom: 0.85,
    minZoom: 0.38,
    maxZoom: 4.5,
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
    decorList: [], // garden_decor rows
    decorAt: {}, // "x,y" -> { ground?: row, object?: row }
    selectedSeed: null, // plant_type key if selected
    selectedTool: null, // 'fertilizer' | 'remove' | null
    selectedDecor: null, // decor_type key if selected
    isConnecting: false,
    isStarted: false,
    channels: [],
    growthIntervalId: null,
    dayNightIntervalId: null,
    weather: null, // { key, label, icon, effect }
    plotStats: { growing: 0, ready: 0, wilted: 0 },
    shopCategory: 'seeds', // seeds | ground | furniture | tools
    shopOpen: false,
    /** 'auto' | 'day' | 'night' — auto follows local clock */
    timeMode: 'auto',
    isNight: false,
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
    this.els.overlay = document.getElementById('garden-loading-overlay');
    this.els.frame = document.querySelector('.game-viewport__frame');
    this.els.weatherChip = document.getElementById('garden-weather-chip');
    this.els.weatherText = document.getElementById('garden-weather-text');
    this.els.plotStats = document.getElementById('garden-plot-stats');
    this.els.panel = document.getElementById('garden-side-panel');
    this.els.panelBody = document.getElementById('garden-panel-body');
    this.els.mcShop = document.getElementById('mc-shop');
    this.els.mcShopGrid = document.getElementById('mc-shop-grid');
    this.els.mcShopTabs = document.getElementById('mc-shop-tabs');
    this.els.mcShopHint = document.getElementById('mc-shop-hint');
    this.els.mcShopPoints = document.getElementById('mc-shop-points');
    this.els.hotbarSlot = document.getElementById('hotbar-selected-slot');
    this.els.hotbarName = document.getElementById('hotbar-selected-name');
    this.els.timeToggle = document.getElementById('garden-time-toggle');
    this.els.timeLabel = document.getElementById('garden-time-label');
    this.els.timeIcon = document.getElementById('garden-time-icon');

    if (!this.els.svg) {
      console.warn('GardenGame: Garden UI elements not found. Skipping initialization.');
      return;
    }

    this.setupCameraControls();
    this.setupShop();
    this.setupPanel();
    this.setupDayNight();
    this.fitCameraToIsland();
    this.renderEmptyGrid();
  },

  clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  },

  clampCameraCenter() {
    const { viewW, viewH } = this.render;
    const visW = viewW / this.camera.zoom;
    const visH = viewH / this.camera.zoom;
    // Allow panning into ocean around the island (not locked to the 1024 square)
    const margin = Math.max(visW, visH) * 0.35;
    const minX = -margin + visW / 2;
    const maxX = viewW + margin - visW / 2;
    const minY = -margin + visH / 2;
    const maxY = viewH + margin - visH / 2;
    this.camera.centerX = this.clamp(this.camera.centerX, Math.min(minX, maxX), Math.max(minX, maxX));
    this.camera.centerY = this.clamp(this.camera.centerY, Math.min(minY, maxY), Math.max(minY, maxY));
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

  getIslandBounds() {
    const poly = this.scalePolygon(this.render.landPolygon, 1.22);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  },

  /** Zoom out far enough that the whole island (+ padding) fits on screen. */
  fitCameraToIsland() {
    const { viewW, viewH } = this.render;
    const b = this.getIslandBounds();
    const pad = 70;
    const zoomX = viewW / (b.width + pad * 2);
    const zoomY = viewH / (b.height + pad * 2);
    const fitZoom = Math.min(zoomX, zoomY);
    this.camera.minZoom = Math.min(this.camera.minZoom, fitZoom * 0.85);
    this.camera.zoom = this.clamp(fitZoom, this.camera.minZoom, this.camera.maxZoom);
    this.camera.centerX = b.cx;
    this.camera.centerY = b.cy;
    this.applyViewBox();
  },

  resetCamera() {
    this.fitCameraToIsland();
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

    // Camera reset button
    const resetBtn = document.getElementById('garden-camera-reset');
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', () => this.resetCamera());
    }
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
      this.refreshWeather();
      this.renderGardenCanvas();
      this.renderPanel();
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
      this.refreshWeather();
      this.applyTimeOfDay(true);
      this.renderGardenCanvas();
      this.renderPanel();
      this.updateConnectionStatus('online', 'Online');
      this.state.isStarted = true;

      // Start auto-render loop for live growth updates (every 2s for progress bars)
      if (this.state.growthIntervalId) clearInterval(this.state.growthIntervalId);
      this.state.growthIntervalId = setInterval(() => {
        if (!this.state.garden) return;
        this.refreshWeather();
        this.renderGardenCanvas();
        this.renderPanel();
        this.checkQuestCompletion(true);
      }, 2000);
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
    this.state.decorList = [];
    this.state.decorAt = {};
    this.state.selectedSeed = null;
    this.state.selectedTool = null;
    this.state.selectedDecor = null;
    this.state.isStarted = false;
    this.closeShop();
    this.updateHotbarSelected();
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

    // Load décor (optional table — toast once if missing)
    this.state.decorList = [];
    this.state.decorAt = {};
    const { data: decorData, error: decorErr } = await window.sb
      .from('garden_decor')
      .select('*')
      .eq('garden_id', this.state.garden.id);

    if (decorErr) {
      if (!this._decorTableWarned) {
        this._decorTableWarned = true;
        console.warn('garden_decor table missing or blocked:', decorErr.message);
        this.toast('Decor needs a DB setup — run supabase_garden_decor.sql', 'warning');
      }
    } else {
      this.state.decorList = decorData || [];
      (decorData || []).forEach((d) => {
        const key = `${d.plot_x},${d.plot_y}`;
        if (!this.state.decorAt[key]) this.state.decorAt[key] = {};
        this.state.decorAt[key][d.layer] = d;
      });
    }

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
        event: '*',
        schema: 'public',
        table: 'garden_decor',
        filter: `garden_id=eq.${this.state.garden.id}`
      }, async (payload) => {
        console.log('Realtime decor update:', payload);
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

  // =============================================
  // Minecraft-style floating inventory shop
  // =============================================
  setupShop() {
    this._shopBound = this._shopBound || false;
    if (!this._shopBound) {
      this._shopBound = true;
      const openBtns = [
        document.getElementById('garden-shop-open'),
        document.getElementById('hotbar-shop-btn'),
      ];
      openBtns.forEach((btn) => {
        btn?.addEventListener('click', () => this.toggleShop());
      });
      document.getElementById('mc-shop-close')?.addEventListener('click', () => this.closeShop());

      this.els.mcShopTabs?.querySelectorAll('.mc-shop__tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          this.state.shopCategory = tab.dataset.cat;
          this.renderShopGrid();
        });
      });

      this.setupShopDrag();

      document.addEventListener('keydown', (e) => {
        if (!this.state.isStarted) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          this.toggleShop();
        }
        if (e.key === 'Escape' && this.state.shopOpen) this.closeShop();
      });
    }

    this.renderShopGrid();
    this.updateHotbarSelected();
  },

  setupShopDrag() {
    const panel = this.els.mcShop;
    const handle = document.getElementById('mc-shop-drag');
    if (!panel || !handle || handle._dragBound) return;
    handle._dragBound = true;

    let dragging = false;
    let ox = 0, oy = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mc-shop__close')) return;
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      const rect = panel.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      panel.classList.add('mc-shop--dragging');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const parent = panel.offsetParent || document.body;
      const parentRect = parent.getBoundingClientRect();
      let left = e.clientX - parentRect.left - ox;
      let top = e.clientY - parentRect.top - oy;
      left = Math.max(8, Math.min(left, parentRect.width - panel.offsetWidth - 8));
      top = Math.max(8, Math.min(top, parentRect.height - 40));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    const endDrag = () => {
      dragging = false;
      panel.classList.remove('mc-shop--dragging');
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  },

  toggleShop() {
    if (this.state.shopOpen) this.closeShop();
    else this.openShop();
  },

  openShop() {
    this.state.shopOpen = true;
    this.els.mcShop?.classList.remove('hidden');
    this.renderShopGrid();
  },

  closeShop() {
    this.state.shopOpen = false;
    this.els.mcShop?.classList.add('hidden');
  },

  shopItemsForCategory(cat) {
    const myPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;
    if (cat === 'seeds') {
      return Object.entries(this.config.plants).map(([key, p]) => ({
        kind: 'seed',
        key,
        name: p.name,
        cost: p.cost,
        desc: `${p.desc} · harvest ${p.harvest} pts`,
        icon: window.PlantRenderer.resolvePlantSVGPath(key, 4),
        affordable: myPoints >= p.cost,
        selected: this.state.selectedSeed === key,
      }));
    }
    if (cat === 'ground') {
      return Object.entries(this.config.decor)
        .filter(([, d]) => d.layer === 'ground')
        .map(([key, d]) => ({
          kind: 'decor',
          key,
          name: d.name,
          cost: d.cost,
          desc: d.desc,
          icon: window.DecorRenderer?.resolveDecorSVGPath(key) || '',
          affordable: myPoints >= d.cost,
          selected: this.state.selectedDecor === key,
        }));
    }
    if (cat === 'furniture') {
      return Object.entries(this.config.decor)
        .filter(([, d]) => d.layer === 'object')
        .map(([key, d]) => ({
          kind: 'decor',
          key,
          name: d.name,
          cost: d.cost,
          desc: d.desc,
          icon: window.DecorRenderer?.resolveDecorSVGPath(key) || '',
          affordable: myPoints >= d.cost,
          selected: this.state.selectedDecor === key,
        }));
    }
    // tools
    const f = this.config.fertilizer;
    return [
      {
        kind: 'tool',
        key: 'fertilizer',
        name: f.name,
        cost: f.cost,
        desc: 'Boost a growing plant',
        icon: window.DecorRenderer?.toolIcon('fertilizer') || '',
        affordable: myPoints >= f.cost,
        selected: this.state.selectedTool === 'fertilizer',
      },
      {
        kind: 'tool',
        key: 'remove',
        name: 'Pick Up',
        cost: null,
        desc: 'Remove décor · half refund',
        icon: window.DecorRenderer?.toolIcon('remove') || '',
        affordable: true,
        selected: this.state.selectedTool === 'remove',
      },
    ];
  },

  renderShopGrid() {
    const grid = this.els.mcShopGrid;
    if (!grid) return;

    const cat = this.state.shopCategory || 'seeds';
    this.els.mcShopTabs?.querySelectorAll('.mc-shop__tab').forEach((tab) => {
      tab.classList.toggle('selected', tab.dataset.cat === cat);
    });

    if (this.els.mcShopPoints) {
      this.els.mcShopPoints.textContent = window.userProfile?.total_task_points ?? 0;
    }

    const items = this.shopItemsForCategory(cat);
    grid.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mc-shop__slot ${item.selected ? 'selected' : ''} ${!item.affordable ? 'disabled' : ''}`;
      btn.title = `${item.name}${item.cost != null ? ` — ${item.cost} pts` : ''} · ${item.desc}`;
      btn.innerHTML = `
        <img class="mc-shop__slot-icon" src="${item.icon}" alt="" />
        <span class="mc-shop__slot-cost">${item.cost != null ? item.cost : '—'}</span>
        <span class="mc-shop__slot-name">${item.name}</span>
      `;
      if (item.affordable) {
        btn.addEventListener('click', () => {
          if (item.kind === 'seed') this.selectSeed(item.key);
          else if (item.kind === 'decor') this.selectDecor(item.key);
          else this.selectTool(item.key);
        });
      }
      grid.appendChild(btn);
    });

    if (this.els.mcShopHint) {
      const hints = {
        seeds: 'Seeds — plant on empty soil (not on furniture).',
        ground: 'Paths & ground cover — can go under plants.',
        furniture: 'Furniture — needs an empty tile.',
        tools: 'Tools — fertilize plants or pick up décor.',
      };
      this.els.mcShopHint.textContent = hints[cat] || '';
    }

    this.updateHotbarSelected();
  },

  updateHotbarSelected() {
    const slot = this.els.hotbarSlot;
    const nameEl = this.els.hotbarName;
    if (!slot || !nameEl) return;

    let icon = '';
    let label = 'Nothing selected';
    let costLabel = '';

    if (this.state.selectedSeed) {
      const p = this.config.plants[this.state.selectedSeed];
      icon = window.PlantRenderer.resolvePlantSVGPath(this.state.selectedSeed, 4);
      label = p.name;
      costLabel = `${p.cost} pts`;
    } else if (this.state.selectedDecor) {
      const d = this.config.decor[this.state.selectedDecor];
      icon = window.DecorRenderer?.resolveDecorSVGPath(this.state.selectedDecor) || '';
      label = d.name;
      costLabel = `${d.cost} pts`;
    } else if (this.state.selectedTool === 'fertilizer') {
      icon = window.DecorRenderer?.toolIcon('fertilizer') || '';
      label = this.config.fertilizer.name;
      costLabel = `${this.config.fertilizer.cost} pts`;
    } else if (this.state.selectedTool === 'remove') {
      icon = window.DecorRenderer?.toolIcon('remove') || '';
      label = 'Pick Up';
      costLabel = 'free';
    }

    if (icon) {
      slot.innerHTML = `<img src="${icon}" alt="" /><span class="game-hotbar__selected-cost">${costLabel}</span>`;
    } else {
      slot.innerHTML = `<span class="game-hotbar__selected-empty">Empty</span>`;
    }
    nameEl.textContent = label;
  },

  selectSeed(key) {
    if (this.state.selectedSeed === key) {
      this.state.selectedSeed = null;
    } else {
      this.state.selectedSeed = key;
      this.state.selectedTool = null;
      this.state.selectedDecor = null;
    }
    this.renderShopGrid();
    this.setHelperText(this.defaultHelperText());
    this.renderGardenCanvas();
  },

  selectDecor(key) {
    if (this.state.selectedDecor === key) {
      this.state.selectedDecor = null;
    } else {
      this.state.selectedDecor = key;
      this.state.selectedSeed = null;
      this.state.selectedTool = null;
    }
    this.renderShopGrid();
    this.setHelperText(this.defaultHelperText());
    this.renderGardenCanvas();
  },

  selectTool(key) {
    if (this.state.selectedTool === key) {
      this.state.selectedTool = null;
    } else {
      this.state.selectedTool = key;
      this.state.selectedSeed = null;
      this.state.selectedDecor = null;
    }
    this.renderShopGrid();
    this.setHelperText(this.defaultHelperText());
    this.renderGardenCanvas();
  },

  defaultHelperText() {
    if (this.state.selectedSeed) {
      return `${this.config.plants[this.state.selectedSeed].name} ready — click soil to plant`;
    }
    if (this.state.selectedDecor) {
      const d = this.config.decor[this.state.selectedDecor];
      return `${d.name} ready — click a tile to place${d.layer === 'ground' ? ' (goes under plants)' : ''}`;
    }
    if (this.state.selectedTool === 'fertilizer') {
      return 'Fertilizer ready — click a growing plant to boost it';
    }
    if (this.state.selectedTool === 'remove') {
      return 'Pick Up ready — click décor to remove it (half refund)';
    }
    return 'Press E or Inventory to shop · Scroll zoom · Drag pan';
  },

  setHelperText(text) {
    if (this.els.helperText) this.els.helperText.textContent = text;
  },

  decorKey(c, r) {
    return `${c},${r}`;
  },

  getDecorAt(c, r) {
    return this.state.decorAt[this.decorKey(c, r)] || {};
  },

  /** Odd-row offset hex neighbors (pointy-top). */
  hexNeighbors(col, row) {
    const odd = row & 1;
    const deltas = odd
      ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]
      : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
    return deltas.map(([dc, dr]) => ({ c: col + dc, r: row + dr }));
  },

  // =============================================
  // Day / night cycle
  // =============================================
  setupDayNight() {
    if (this.els.timeToggle && !this.els.timeToggle._bound) {
      this.els.timeToggle._bound = true;
      this.els.timeToggle.addEventListener('click', () => this.cycleTimeMode());
    }
    this.applyTimeOfDay(true);
    if (this.state.dayNightIntervalId) clearInterval(this.state.dayNightIntervalId);
    this.state.dayNightIntervalId = setInterval(() => this.applyTimeOfDay(false), 30000);
  },

  cycleTimeMode() {
    const order = ['auto', 'day', 'night'];
    const i = order.indexOf(this.state.timeMode);
    this.state.timeMode = order[(i + 1) % order.length];
    this.applyTimeOfDay(true);
  },

  computeIsNight() {
    if (this.state.timeMode === 'day') return false;
    if (this.state.timeMode === 'night') return true;
    const h = new Date().getHours();
    return h >= 19 || h < 6;
  },

  applyTimeOfDay(forceRender) {
    const next = this.computeIsNight();
    const changed = next !== this.state.isNight;
    this.state.isNight = next;
    this.updateTimeToggleUI();
    // Keep CSS letterbox ocean in sync with SVG (day/night)
    document.querySelector('.garden-game-view')?.classList.toggle('is-night', next);
    this.syncOceanFill();
    if ((changed || forceRender) && this.state.isStarted) {
      this.renderGardenCanvas();
    } else if (changed || forceRender) {
      this.renderEmptyGrid();
    }
  },

  /** Keep SVG ocean rect matching CSS so zoom letterboxing never shows a box seam. */
  syncOceanFill() {
    const color = this.state.isNight ? '#0a1830' : '#3a9ec4';
    this.els.svg?.querySelectorAll('.game-ocean-fill').forEach((el) => {
      el.setAttribute('fill', color);
    });
    // Also patch legacy ocean rects that used the gradient
    const procedural = this.els.svg?.querySelector('.game-scene-island--procedural');
    const firstRect = procedural?.querySelector(':scope > rect');
    if (firstRect && !firstRect.classList.contains('game-ocean-fill')) {
      firstRect.setAttribute('fill', color);
      firstRect.classList.add('game-ocean-fill');
    }
    // Hide old bright ocean-glow ellipse if present
    procedural?.querySelectorAll(':scope > ellipse[fill="url(#ocean-glow)"]').forEach((el) => {
      el.setAttribute('opacity', '0');
    });
  },

  updateTimeToggleUI() {
    if (this.els.timeLabel) {
      const labels = { auto: 'Auto', day: 'Day', night: 'Night' };
      this.els.timeLabel.textContent = labels[this.state.timeMode] || 'Auto';
    }
    if (this.els.timeIcon) {
      this.els.timeIcon.innerHTML = this.state.isNight ? this.moonIconSvg() : this.weatherIconSvg('sun');
    }
    this.els.timeToggle?.classList.toggle('game-time-toggle--night', this.state.isNight);
  },

  moonIconSvg() {
    return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 2.2A6 6 0 1 0 13.8 10 4.8 4.8 0 0 1 10 2.2Z" fill="#e8e0c8"/></svg>`;
  },

  luminousDecorTypes() {
    return new Set(['lantern', 'campfire']);
  },

  // =============================================
  // Weather (deterministic per calendar day)
  // =============================================
  hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
  },

  weatherForDate(d) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const roll = this.hashString(`weather:${key}`) % 5;
    if (roll <= 1) return { key: 'sunny', label: 'Sunny', icon: 'sun', effect: 'Plants grow 30% faster today' };
    if (roll === 4) return { key: 'rainy', label: 'Rainy', icon: 'rain', effect: 'Rain keeps plants watered — no wilting today' };
    return { key: 'cloudy', label: 'Cloudy', icon: 'cloud', effect: 'A calm day on the isle' };
  },

  weatherIconSvg(kind) {
    if (kind === 'sun') {
      return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="#f5c84a"/><g stroke="#f5c84a" stroke-width="1.4" stroke-linecap="round"><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"/></g></svg>`;
    }
    if (kind === 'rain') {
      return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="6.5" rx="5" ry="3.2" fill="#9eb8c8"/><path d="M5 10.5l-1 2.5M8 10.5l-1 2.5M11 10.5l-1 2.5" stroke="#6ec4e8" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    }
    return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="6" cy="8" rx="3.5" ry="2.4" fill="#c5d4de"/><ellipse cx="10" cy="7.5" rx="4" ry="2.8" fill="#d5e0e8"/></svg>`;
  },

  refreshWeather() {
    const w = this.weatherForDate(new Date());
    const changed = !this.state.weather || this.state.weather.key !== w.key;
    this.state.weather = w;
    if (this.els.weatherText) this.els.weatherText.textContent = w.label;
    if (this.els.weatherChip) {
      const iconEl = this.els.weatherChip.querySelector('.game-hud__chip-icon');
      if (iconEl) iconEl.innerHTML = this.weatherIconSvg(w.icon);
      this.els.weatherChip.title = w.effect;
    }
    return changed;
  },

  growthMultiplier() {
    return this.state.weather?.key === 'sunny' ? 1.3 : 1;
  },

  // =============================================
  // Golden plants (deterministic per plant)
  // =============================================
  isGoldenPlant(plant) {
    if (!plant || !plant.id) return false;
    return this.hashString(`golden:${plant.id}`) % 100 < this.config.goldenChance;
  },

  // =============================================
  // Daily quests (per user, per day — stored locally)
  // =============================================
  questDefs() {
    return [
      { id: 'study', icon: '⏱', text: 'Study 25 min today', target: 25 * 60, reward: 5, kind: 'study' },
      { id: 'plant', icon: 'P', text: 'Plant a seed', target: 1, reward: 4, kind: 'count', key: 'plant' },
      { id: 'water', icon: 'W', text: 'Water 3 plants', target: 3, reward: 4, kind: 'count', key: 'water' },
      { id: 'harvest', icon: 'H', text: 'Harvest a plant', target: 1, reward: 5, kind: 'count', key: 'harvest' },
      { id: 'coop', icon: 'C', text: "Water a partner's plant", target: 1, reward: 3, kind: 'count', key: 'partnerWater' },
      { id: 'decor', icon: 'D', text: 'Place a decoration', target: 1, reward: 4, kind: 'count', key: 'decor' },
    ];
  },

  todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  dailyQuests() {
    const defs = this.questDefs();
    const roll = this.hashString(`quests:${this.todayKey()}`);
    const rotating = defs.filter(q => q.kind === 'count');
    const first = rotating[roll % rotating.length];
    const rest = rotating.filter(q => q.id !== first.id);
    const second = rest[(roll >> 3) % rest.length];
    return [defs.find(q => q.id === 'study'), first, second];
  },

  questStore() {
    const uid = window.currentUser?.id || 'anon';
    const key = `studyloop_quests_${uid}_${this.todayKey()}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch { /* no-op */ }
    return { counts: {}, claimed: [] };
  },

  saveQuestStore(store) {
    const uid = window.currentUser?.id || 'anon';
    const key = `studyloop_quests_${uid}_${this.todayKey()}`;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch { /* no-op */ }
  },

  trackQuestEvent(key, amount = 1) {
    const store = this.questStore();
    store.counts[key] = (store.counts[key] || 0) + amount;
    this.saveQuestStore(store);
    this.checkQuestCompletion();
    this.renderPanel();
  },

  questProgress(q) {
    if (q.kind === 'study') {
      return typeof window.getMyTodayFocusSeconds === 'function'
        ? window.getMyTodayFocusSeconds()
        : 0;
    }
    const store = this.questStore();
    return store.counts[q.key] || 0;
  },

  checkQuestCompletion(silent = false) {
    const store = this.questStore();
    this.dailyQuests().forEach(q => {
      if (store.claimed.includes(q.id)) return;
      const progress = this.questProgress(q);
      if (progress >= q.target) {
        store.claimed.push(q.id);
        this.saveQuestStore(store);
        if (typeof window.adjustUserTaskPoints === 'function') {
          window.adjustUserTaskPoints(q.reward);
        }
        if (!silent || document.visibilityState === 'visible') {
          this.toast(`Quest complete: ${q.text} — +${q.reward} pts!`, 'success');
        }
        this.renderPanel();
      }
    });
  },

  // =============================================
  // Side panel (quests, level, farm status)
  // =============================================
  setupPanel() {
    const toggle = document.getElementById('garden-panel-toggle');
    const panel = this.els.panel;
    if (toggle && panel && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', () => {
        panel.classList.toggle('garden-side-panel--closed');
      });
    }
  },

  renderPanel() {
    const body = this.els.panelBody;
    if (!body) return;

    const quests = this.dailyQuests();
    const store = this.questStore();
    const questRows = quests.map(q => {
      const done = store.claimed.includes(q.id);
      const progress = Math.min(this.questProgress(q), q.target);
      const pct = Math.round((progress / q.target) * 100);
      const progressLabel = q.kind === 'study'
        ? `${Math.floor(progress / 60)}/${Math.floor(q.target / 60)} min`
        : `${progress}/${q.target}`;
      return `
        <div class="garden-quest ${done ? 'garden-quest--done' : ''}">
          <span class="garden-quest__icon">${q.icon}</span>
          <div class="garden-quest__body">
            <p class="garden-quest__text">${q.text}</p>
            <div class="garden-panel-bar garden-panel-bar--sm">
              <div class="garden-panel-bar__fill" style="width:${pct}%"></div>
            </div>
          </div>
          <span class="garden-quest__meta">${done ? '✓' : progressLabel}<em>+${q.reward}</em></span>
        </div>`;
    }).join('');

    const st = this.state.plotStats;
    const decorCount = this.state.decorList.length;
    body.innerHTML = `
      <div class="garden-panel-card">
        <div class="garden-panel-card__head"><span>Daily Quests</span></div>
        <div class="garden-quest-list">${questRows}</div>
      </div>
      <div class="garden-panel-card">
        <div class="garden-panel-card__head"><span>Isle Status</span></div>
        <div class="garden-farm-stats">
          <span>${st.growing} growing</span>
          <span>${st.ready} ready</span>
          <span>${st.wilted} wilted</span>
          <span>${decorCount} décor</span>
        </div>
      </div>
    `;
  },

  // =============================================
  // Island geometry
  // =============================================
  /** Ray-cast point-in-polygon against the organic coastline. */
  pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  /** Scale polygon toward its centroid (for nested beach / grass rings). */
  scalePolygon(poly, factor) {
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length;
    cy /= poly.length;
    return poly.map(([x, y]) => [
      cx + (x - cx) * factor,
      cy + (y - cy) * factor,
    ]);
  },

  landPolyPoints(poly) {
    return poly.map(([x, y]) => `${x},${y}`).join(' ');
  },

  /** True when point is on island land (not water / off-island). */
  isOnLand(x, y) {
    return this.pointInPolygon(x, y, this.render.landPolygon);
  },

  /** Cottage + grove — not plantable. */
  isInHouseZone(x, y) {
    if (x >= 90 && x < 270 && y >= 180 && y <= 420) return true;
    if (x >= 250 && x <= 470 && y >= 185 && y <= 380) return true;
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
      const spriteTop = tile.cy - size + 4;
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
    let defs = svg.querySelector('#game-scene-defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.setAttribute('id', 'game-scene-defs');
      defs.innerHTML = `
      <linearGradient id="ocean-depth" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#3a9ec4"/>
        <stop offset="100%" stop-color="#3a9ec4"/>
      </linearGradient>
      <radialGradient id="ocean-glow" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#3a9ec4" stop-opacity="0"/>
        <stop offset="100%" stop-color="#3a9ec4" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8ecd0"/>
        <stop offset="50%" stop-color="#edd9a8"/>
        <stop offset="100%" stop-color="#dcc48a"/>
      </linearGradient>
      <linearGradient id="grass-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#b4dfa0"/>
        <stop offset="55%" stop-color="#7ec86a"/>
        <stop offset="100%" stop-color="#5aaf52"/>
      </linearGradient>
      <linearGradient id="growth-bar-fill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#8fd4a8"/>
        <stop offset="100%" stop-color="#f0d878"/>
      </linearGradient>
      <filter id="game-plant-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1a1208" flood-opacity="0.35"/>
      </filter>
      <filter id="game-soil-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="game-golden-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#f7c948" flood-opacity="0.9"/>
      </filter>
      <filter id="soft-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.5"/>
      </filter>
    `;
      svg.appendChild(defs);
    }

    if (!defs.querySelector('#night-lamp-glow')) {
      defs.setAttribute('data-glow-ver', '2');
      defs.insertAdjacentHTML('beforeend', `
        <radialGradient id="night-lamp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffb347" stop-opacity="0.4"/>
          <stop offset="40%" stop-color="#ff9a3c" stop-opacity="0.14"/>
          <stop offset="75%" stop-color="#ff8a2a" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#ff8a2a" stop-opacity="0"/>
        </radialGradient>
        <filter id="game-night-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 1
                    0 0 0 0 0.65
                    0 0 0 0 0.2
                    0 0 0 0.28 0" result="glow"/>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="soft-light-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16"/>
        </filter>
        <filter id="soft-mask-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="18"/>
        </filter>
      `);
    } else {
      this.refreshNightGlowDefs(defs);
    }
  },

  refreshNightGlowDefs(defs) {
    if (defs.querySelector('#soft-light-blur') && defs.getAttribute('data-glow-ver') === '2') return;
    ['night-lamp-glow', 'game-night-glow', 'soft-light-blur', 'soft-mask-blur'].forEach((id) => {
      defs.querySelector(`#${id}`)?.remove();
    });
    defs.insertAdjacentHTML('beforeend', `
      <radialGradient id="night-lamp-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffb347" stop-opacity="0.4"/>
        <stop offset="40%" stop-color="#ff9a3c" stop-opacity="0.14"/>
        <stop offset="75%" stop-color="#ff8a2a" stop-opacity="0.04"/>
        <stop offset="100%" stop-color="#ff8a2a" stop-opacity="0"/>
      </radialGradient>
      <filter id="game-night-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
        <feColorMatrix in="blur" type="matrix"
          values="0 0 0 0 1
                  0 0 0 0 0.65
                  0 0 0 0 0.2
                  0 0 0 0.28 0" result="glow"/>
        <feMerge>
          <feMergeNode in="glow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="soft-light-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="16"/>
      </filter>
      <filter id="soft-mask-blur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
    `);
    defs.setAttribute('data-glow-ver', '2');
  },

  /** Organic cozy island with layered coast and occasional ocean waves. */
  buildProceduralIsland() {
    const land = this.render.landPolygon;
    const sand = this.scalePolygon(land, 1.05);
    const grass = this.scalePolygon(land, 0.93);
    const shallow = this.scalePolygon(land, 1.12);
    const reef = this.scalePolygon(land, 1.2);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'game-scene-island game-scene-island--procedural');
    g.innerHTML = `
      <!-- Deep ocean (solid — matches CSS letterbox so no visible seam) -->
      <rect class="game-ocean-fill" x="-1200" y="-1200" width="3424" height="3424" fill="#3a9ec4"/>

      <!-- Soft ambient wave rings -->
      <g class="ocean-waves" opacity="0.5">
        <ellipse cx="140" cy="180" rx="100" ry="20" fill="none" stroke="#c8eef8" stroke-width="2" opacity="0.35">
          <animate attributeName="rx" values="80;120;80" dur="7s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.12;0.38;0.12" dur="7s" repeatCount="indefinite"/>
        </ellipse>
        <ellipse cx="900" cy="820" rx="110" ry="22" fill="none" stroke="#c8eef8" stroke-width="2" opacity="0.3">
          <animate attributeName="rx" values="90;130;90" dur="8.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.1;0.32;0.1" dur="8.5s" repeatCount="indefinite"/>
        </ellipse>
      </g>

      <!-- Occasional traveling wave crests -->
      <g class="ocean-wave-crests" fill="none" stroke="#e8f8ff" stroke-width="2.5" stroke-linecap="round">
        <path d="M20 360 q50 -18 100 0 q50 18 100 0" opacity="0">
          <animate attributeName="opacity" values="0;0;0.55;0.25;0;0" keyTimes="0;0.62;0.7;0.82;0.9;1" dur="11s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0; 90 -8; 180 4" keyTimes="0;0.7;1" dur="11s" repeatCount="indefinite"/>
        </path>
        <path d="M780 200 q45 -14 90 0 q45 14 90 0" opacity="0">
          <animate attributeName="opacity" values="0;0;0.5;0.2;0;0" keyTimes="0;0.55;0.65;0.78;0.88;1" dur="14s" begin="3s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0; -70 12; -140 6" keyTimes="0;0.65;1" dur="14s" begin="3s" repeatCount="indefinite"/>
        </path>
        <path d="M60 780 q55 -16 110 0 q55 16 110 0" opacity="0">
          <animate attributeName="opacity" values="0;0;0.48;0.22;0;0" keyTimes="0;0.7;0.78;0.88;0.95;1" dur="13s" begin="6s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0; 70 -10; 150 0" keyTimes="0;0.78;1" dur="13s" begin="6s" repeatCount="indefinite"/>
        </path>
        <path d="M700 680 q48 -15 96 0 q48 15 96 0" opacity="0">
          <animate attributeName="opacity" values="0;0;0.52;0.2;0;0" keyTimes="0;0.48;0.58;0.72;0.85;1" dur="12s" begin="1.5s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0; -60 8; -120 -4" keyTimes="0;0.58;1" dur="12s" begin="1.5s" repeatCount="indefinite"/>
        </path>
        <path d="M880 480 q40 -12 80 0 q40 12 80 0" opacity="0">
          <animate attributeName="opacity" values="0;0;0.45;0.18;0;0" keyTimes="0;0.75;0.82;0.9;0.96;1" dur="16s" begin="8s" repeatCount="indefinite"/>
          <animateTransform attributeName="transform" type="translate" values="0 0; -50 -6; -100 4" keyTimes="0;0.82;1" dur="16s" begin="8s" repeatCount="indefinite"/>
        </path>
      </g>

      <!-- Soft foam / reef shelf -->
      <polygon points="${this.landPolyPoints(reef)}" fill="#6ec8e0" opacity="0.32"/>
      <polygon points="${this.landPolyPoints(shallow)}" fill="#9adcee" opacity="0.4"/>

      <!-- Sandy shoreline -->
      <polygon points="${this.landPolyPoints(sand)}" fill="url(#sand-grad)"/>
      <!-- Grass plateau -->
      <polygon points="${this.landPolyPoints(grass)}" fill="url(#grass-grad)"/>
      <polygon points="${this.landPolyPoints(land)}" fill="none" stroke="#d4bc88" stroke-width="5" opacity="0.5"/>
      <polygon points="${this.landPolyPoints(grass)}" fill="none" stroke="#6aae58" stroke-width="3" opacity="0.35"/>

      <!-- Soft terrain patches -->
      <ellipse cx="600" cy="600" rx="150" ry="85" fill="#98d878" opacity="0.45"/>
      <ellipse cx="390" cy="560" rx="125" ry="72" fill="#98d878" opacity="0.35"/>
      <ellipse cx="540" cy="360" rx="110" ry="60" fill="#b0e088" opacity="0.3"/>
      <ellipse cx="700" cy="450" rx="60" ry="9" fill="#5a8a48" opacity="0.15"/>
      <ellipse cx="360" cy="450" rx="50" ry="8" fill="#5a8a48" opacity="0.12"/>

      <!-- Gentle cliff hint -->
      <path d="M220 280 Q180 330 190 390 Q240 360 280 310 Z" fill="#9aaa78" opacity="0.55"/>

      <!-- Cozy cottage -->
      <g class="island-cottage">
        <ellipse cx="175" cy="360" rx="60" ry="14" fill="#4a6a38" opacity="0.3"/>
        <rect x="125" y="275" width="105" height="78" rx="5" fill="#e0b888"/>
        <polygon points="112,280 177,218 243,280" fill="#d46858"/>
        <polygon points="112,280 177,218 243,280" fill="#b85040" opacity="0.28"/>
        <rect x="160" y="310" width="32" height="43" rx="2" fill="#7a4e32"/>
        <rect x="138" y="292" width="22" height="20" rx="2" fill="#fff4dc"/>
        <rect x="198" y="292" width="22" height="20" rx="2" fill="#fff4dc"/>
        <rect x="143" y="297" width="12" height="10" fill="#8ec8e0" opacity="0.75"/>
        <rect x="203" y="297" width="12" height="10" fill="#8ec8e0" opacity="0.75"/>
        <rect x="205" y="255" width="15" height="30" fill="#9a6050"/>
      </g>

      <!-- Palm trees -->
      <g class="island-palms">
        <ellipse cx="300" cy="300" rx="20" ry="7" fill="#4a6a38" opacity="0.28"/>
        <rect x="295" y="240" width="9" height="60" rx="3" fill="#9a7048" transform="rotate(-8 300 270)"/>
        <ellipse cx="278" cy="235" rx="24" ry="11" fill="#4aaa58" transform="rotate(-35 278 235)"/>
        <ellipse cx="318" cy="230" rx="26" ry="11" fill="#5aba68" transform="rotate(30 318 230)"/>
        <ellipse cx="298" cy="218" rx="20" ry="10" fill="#68c674" transform="rotate(5 298 218)"/>
        <ellipse cx="286" cy="245" rx="18" ry="9" fill="#4aaa58" transform="rotate(-55 286 245)"/>

        <ellipse cx="370" cy="315" rx="18" ry="6" fill="#4a6a38" opacity="0.28"/>
        <rect x="365" y="258" width="8" height="54" rx="3" fill="#9a7048" transform="rotate(6 370 285)"/>
        <ellipse cx="348" cy="252" rx="22" ry="10" fill="#4aaa58" transform="rotate(-40 348 252)"/>
        <ellipse cx="390" cy="250" rx="24" ry="10" fill="#5aba68" transform="rotate(35 390 250)"/>
        <ellipse cx="368" cy="238" rx="18" ry="9" fill="#68c674"/>
      </g>

      <!-- Wooden dock -->
      <g class="island-dock">
        <rect x="820" y="340" width="15" height="100" rx="2" fill="#9a7048" transform="rotate(28 827 390)"/>
        <rect x="842" y="358" width="15" height="78" rx="2" fill="#a88055" transform="rotate(28 849 397)"/>
        <rect x="864" y="375" width="13" height="55" rx="2" fill="#9a7048" transform="rotate(28 870 402)"/>
        <rect x="805" y="325" width="78" height="13" rx="2" fill="#b88858" transform="rotate(28 844 331)"/>
        <ellipse cx="910" cy="430" rx="24" ry="9" fill="#3a98b8" opacity="0.35"/>
      </g>

      <!-- Coastal rocks -->
      <ellipse cx="200" cy="760" rx="32" ry="16" fill="#7a8a98"/>
      <ellipse cx="225" cy="750" rx="20" ry="11" fill="#8a9aa8"/>
      <ellipse cx="780" cy="160" rx="26" ry="14" fill="#7a8a98"/>
      <ellipse cx="805" cy="152" rx="16" ry="9" fill="#9aaab8"/>
      <ellipse cx="120" cy="450" rx="18" ry="10" fill="#6a7a88"/>

      <!-- Path stones -->
      <ellipse cx="250" cy="390" rx="12" ry="7" fill="#e8d8b8"/>
      <ellipse cx="290" cy="418" rx="12" ry="7" fill="#d8c8a8"/>
      <ellipse cx="332" cy="445" rx="12" ry="7" fill="#e8d8b8"/>
      <ellipse cx="375" cy="470" rx="11" ry="6" fill="#d8c8a8"/>

      <!-- Soft sparkles -->
      <g class="ocean-sparkles">
        <circle cx="120" cy="520" r="2" fill="#fff" opacity="0.55">
          <animate attributeName="opacity" values="0.15;0.7;0.15" dur="3.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="920" cy="580" r="2.5" fill="#fff" opacity="0.45">
          <animate attributeName="opacity" values="0.1;0.65;0.1" dur="4.2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="80" cy="280" r="1.5" fill="#fff" opacity="0.5">
          <animate attributeName="opacity" values="0.12;0.7;0.12" dur="2.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="960" cy="360" r="2" fill="#fff" opacity="0.4">
          <animate attributeName="opacity" values="0.1;0.6;0.1" dur="3.8s" repeatCount="indefinite"/>
        </circle>
      </g>
    `;
    return g;
  },

  drawSceneBackground(parent) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bg.setAttribute('class', 'game-scene-island');
    bg.appendChild(this.buildProceduralIsland());
    parent.appendChild(bg);
  },

  buildPlotHitArea(cx, cy) {
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.setAttribute('points', this.hexPoints(cx, cy));
    hit.setAttribute('class', 'game-plot-tile__hit');
    return hit;
  },

  /** Cozy growth slider under a plant — fill = progress, label = time left. */
  buildGrowthProgressBar(cx, cy, plant, now, wilted) {
    const pct = this.growthPercent(plant, now);
    const remain = this.growthRemainingSeconds(plant, now);
    const barW = 38;
    const barH = 6;
    const x = cx - barW / 2;
    const fillW = Math.max(1.5, (pct / 100) * (barW - 2));

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `game-growth-bar${wilted ? ' game-growth-bar--wilted' : ''}`);
    g.setAttribute('transform', `translate(0, 0)`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', x);
    bg.setAttribute('y', cy);
    bg.setAttribute('width', barW);
    bg.setAttribute('height', barH);
    bg.setAttribute('rx', 3);
    bg.setAttribute('class', 'game-growth-bar__track');

    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fill.setAttribute('x', x + 1);
    fill.setAttribute('y', cy + 1);
    fill.setAttribute('width', fillW);
    fill.setAttribute('height', barH - 2);
    fill.setAttribute('rx', 2);
    fill.setAttribute('class', 'game-growth-bar__fill');
    if (wilted) fill.setAttribute('fill', '#c4a070');
    else fill.setAttribute('fill', 'url(#growth-bar-fill)');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', cy + barH + 10);
    label.setAttribute('class', 'game-growth-bar__label');
    label.textContent = this.formatRemaining(remain);

    g.appendChild(bg);
    g.appendChild(fill);
    g.appendChild(label);
    return g;
  },

  formatRemaining(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r > 0 ? `${m}m ${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  },

  growthRemainingSeconds(plant, now = new Date()) {
    const config = this.config.plants[plant.plant_type];
    if (!config) return 0;
    const plantedAt = new Date(plant.planted_at).getTime();
    let elapsedSeconds = Math.max(0, (now.getTime() - plantedAt) / 1000);
    elapsedSeconds *= this.growthMultiplier();
    const boostSeconds = (plant.water_boosts || 0) * config.boost;
    return Math.max(0, config.growTime - (elapsedSeconds + boostSeconds));
  },

  buildButterfly(color, durSec, pathD, beginSec) {
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    b.setAttribute('class', 'game-butterfly');
    b.innerHTML = `
      <g class="game-butterfly__wings">
        <animateTransform attributeName="transform" type="scale" values="1 1;0.35 1;1 1" dur="0.32s" repeatCount="indefinite"/>
        <ellipse cx="-3.4" cy="0" rx="3.6" ry="2.4" fill="${color}"/>
        <ellipse cx="3.4" cy="0" rx="3.6" ry="2.4" fill="${color}"/>
        <rect x="-0.7" y="-2.4" width="1.4" height="4.8" rx="0.7" fill="#4a3627"/>
      </g>
      <animateMotion dur="${durSec}s" begin="${beginSec}s" repeatCount="indefinite" path="${pathD}"/>
    `;
    return b;
  },

  renderScene(includeInteractions = false) {
    if (!this.els.svg) return;

    this.ensureSceneDefs(this.els.svg);
    this.syncOceanFill();

    let world = this.els.svg.querySelector('#game-world');
    if (!world) {
      this.els.svg.innerHTML = '';
      this.ensureSceneDefs(this.els.svg);
      world = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      world.setAttribute('id', 'game-world');
      this.els.svg.appendChild(world);
      this.drawSceneBackground(world);
      this.syncOceanFill();
    }

    const existingLayer = world.querySelector('#game-plot-layer');
    if (existingLayer) existingLayer.remove();
    const existingDecor = world.querySelector('#game-decor-layer');
    if (existingDecor) existingDecor.remove();
    const existingFx = world.querySelector('#game-fx-layer');
    if (existingFx) existingFx.remove();

    const decorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    decorLayer.setAttribute('id', 'game-decor-layer');
    world.appendChild(decorLayer);

    // Draw ground décor first, then objects (sorted by Y for depth)
    const decorDrawList = [...this.state.decorList].sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'ground' ? -1 : 1;
      return a.plot_y - b.plot_y || a.plot_x - b.plot_x;
    });

    decorDrawList.forEach((d) => {
      const { x: cx, y: cy } = this.hexToScreen(d.plot_x, d.plot_y);
      if (!this.isFarmable(cx, cy) && !this.isOnLand(cx, cy)) return;
      const sprite = this.buildDecorSprite(d, cx, cy);
      if (sprite) decorLayer.appendChild(sprite);
    });

    const plotLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    plotLayer.setAttribute('id', 'game-plot-layer');
    world.appendChild(plotLayer);

    const now = new Date();
    const myLetter = window.userProfile ? (window.userProfile.display_name || 'M').charAt(0).toUpperCase() : 'Y';
    const partnerLetter = window.partnerProfile ? (window.partnerProfile.display_name || 'P').charAt(0).toUpperCase() : 'P';

    let growing = 0, ready = 0, wiltedCount = 0;

    this.getFarmableHexTiles().forEach(({ c, r, cx, cy }) => {
      const plot = this.state.plots.find(p => p.plot_x === c && p.plot_y === r);
      const plant = plot ? this.state.plantsMap[plot.id] : null;
      const hasPlant = !!(plot && plant);
      const tileDecor = this.getDecorAt(c, r);

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'game-plot-tile');
      group.setAttribute('data-col', c);
      group.setAttribute('data-row', r);
      if (this.state.selectedSeed && !hasPlant && !tileDecor.object) {
        group.classList.add('game-plot-tile--selected');
      }
      if (this.state.selectedDecor) {
        const cfg = this.config.decor[this.state.selectedDecor];
        const canPlace = cfg.layer === 'ground'
          ? true
          : !hasPlant && !tileDecor.object;
        if (canPlace) group.classList.add('game-plot-tile--decor-ok');
        else group.classList.add('game-plot-tile--decor-blocked');
      }
      if (this.state.selectedTool === 'remove' && (tileDecor.object || tileDecor.ground)) {
        group.classList.add('game-plot-tile--remove');
      }
      if (hasPlant) group.classList.add('game-plot-tile--planted');

      group.appendChild(this.buildPlotHitArea(cx, cy));

      if (hasPlant) {
        const stage = this.calculatePlantStage(plant, now);
        const wilted = this.isPlantWilted(plant, now);
        const golden = this.isGoldenPlant(plant);
        if (stage >= 4) ready++;
        else if (wilted) wiltedCount++;
        else growing++;

        const iconPath = window.PlantRenderer.resolvePlantSVGPath(plant.plant_type, stage);
        const size = window.PlantRenderer.resolvePlantDisplaySize(plant.plant_type, stage);
        const spriteTop = cy - size + 4;
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
        image.setAttribute('y', cy - size + 4);
        image.setAttribute('width', size);
        image.setAttribute('height', size);
        image.setAttribute('class', `game-plant-sprite${wilted ? ' wilted-plant' : ''}${stage >= 4 ? ' game-plant-sprite--mature' : ''}`);
        image.setAttribute('filter', golden ? 'url(#game-golden-glow)' : 'url(#game-plant-shadow)');
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

        // Growth progress bar (time remaining) for plants still growing
        if (stage < 4) {
          group.appendChild(this.buildGrowthProgressBar(cx, cy + 8, plant, now, wilted));
        }

        if (includeInteractions) {
          group.addEventListener('mouseenter', () => {
            const lastWateredText = plant.last_watered_at
              ? `${Math.round((Date.now() - new Date(plant.last_watered_at).getTime()) / 1000 / 60)}m ago`
              : 'Never';
            const stages = ['Seed', 'Sprout', 'Growing', 'Mature', 'Bloom'];
            const cfg = this.config.plants[plant.plant_type];
            const plantName = cfg?.name || plant.plant_type;
            const goldTag = golden ? ' GOLDEN' : '';
            const leftLabel = stage < 4 ? ` · ${this.formatRemaining(this.growthRemainingSeconds(plant, now))} left` : '';
            let action;
            if (this.state.selectedTool === 'remove') {
              action = tileDecor.object || tileDecor.ground
                ? 'Click to pick up décor under/near this plant'
                : 'No décor on this tile';
            } else if (this.state.selectedDecor) {
              const dcfg = this.config.decor[this.state.selectedDecor];
              action = dcfg.layer === 'ground'
                ? `Click to lay ${dcfg.name} under the plant`
                : 'Furniture needs an empty tile';
            } else if (this.state.selectedTool === 'fertilizer') {
              action = stage >= 4 ? 'Already blooming' : `Click to fertilize (${this.config.fertilizer.cost} pts)`;
            } else if (stage >= 4) {
              const reward = cfg.harvest * (golden ? this.config.goldenMultiplier : 1);
              action = `Click to harvest (+${reward} pts)`;
            } else if (wilted) {
              action = 'Wilted — click to water';
            } else {
              action = `${this.growthPercent(plant, now)}% grown${leftLabel} · Click to water`;
            }
            this.setHelperText(
              `${goldTag ? goldTag + ' ' : ''}${plantName} · ${isMe ? 'You' : 'Partner'} · ${stages[stage]} · ${action} · Last water: ${lastWateredText}`
            );
          });
        }
      } else if (includeInteractions) {
        group.addEventListener('mouseenter', () => {
          const bits = [];
          if (tileDecor.ground) {
            bits.push(this.config.decor[tileDecor.ground.decor_type]?.name || 'Path');
          }
          if (tileDecor.object) {
            bits.push(this.config.decor[tileDecor.object.decor_type]?.name || 'Décor');
          }
          const decorLabel = bits.length ? bits.join(' + ') : 'Empty soil';

          if (this.state.selectedTool === 'remove') {
            this.setHelperText(
              bits.length
                ? `${decorLabel} — click to pick up (half refund)`
                : 'Nothing to pick up here'
            );
          } else if (this.state.selectedDecor) {
            const d = this.config.decor[this.state.selectedDecor];
            this.setHelperText(`Click to place ${d.name}`);
          } else if (this.state.selectedSeed) {
            this.setHelperText(
              tileDecor.object
                ? 'Furniture is in the way — pick it up first'
                : `Click to plant ${this.config.plants[this.state.selectedSeed].name}`
            );
          } else {
            this.setHelperText(`${decorLabel} — select a seed or décor from the toolbar`);
          }
        });
      }

      if (includeInteractions) {
        group.addEventListener('mouseleave', () => this.setHelperText(this.defaultHelperText()));
      }

      plotLayer.appendChild(group);
    });

    this.state.plotStats = { growing, ready, wilted: wiltedCount };
    this.updatePlotStatsStrip();

    // Butterflies appear once the garden starts blooming
    if (ready >= 2) {
      const fx = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      fx.setAttribute('id', 'game-fx-layer');
      const count = Math.min(3, ready - 1);
      const colors = ['#f2a2c0', '#a2c8f2', '#f7d774'];
      const paths = [
        'M 300 500 C 400 380, 620 380, 700 500 C 780 620, 500 700, 380 620 C 300 560, 260 540, 300 500 Z',
        'M 620 420 C 760 400, 840 520, 740 620 C 640 720, 420 660, 460 540 C 490 450, 540 430, 620 420 Z',
        'M 420 640 C 340 560, 420 440, 560 460 C 700 480, 720 620, 600 680 C 510 720, 460 700, 420 640 Z',
      ];
      for (let i = 0; i < count; i++) {
        fx.appendChild(this.buildButterfly(colors[i % colors.length], 16 + i * 5, paths[i % paths.length], -i * 4));
      }
      world.appendChild(fx);
    }

    this.buildNightLayer(world);

    // Cottage stays unfiltered — soft light pools handle the glow
    const cottage = world.querySelector('.island-cottage');
    if (cottage) {
      cottage.classList.toggle('island-cottage--night', !!this.state.isNight);
      cottage.removeAttribute('filter');
    }
  },

  updatePlotStatsStrip() {
    if (!this.els.plotStats) return;
    const st = this.state.plotStats;
    const decorCount = this.state.decorList.length;
    this.els.plotStats.textContent = `${st.growing} growing · ${st.ready} ready · ${st.wilted} wilted · ${decorCount} décor`;
  },

  buildDecorSprite(decorRow, cx, cy) {
    if (!window.DecorRenderer) return null;
    const type = decorRow.decor_type;
    const href = window.DecorRenderer.resolveDecorSVGPath(type);
    if (!href) return null;
    const size = window.DecorRenderer.resolveDecorDisplaySize(type);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const luminous = this.luminousDecorTypes().has(type);
    g.setAttribute('class', `game-decor-sprite game-decor-sprite--${decorRow.layer}${luminous ? ' game-decor-sprite--glow' : ''}`);
    g.setAttribute('pointer-events', 'none');

    // Connected path / fence chains toward neighboring same-type tiles
    if (type === 'path_stone' || type === 'path_dirt' || type === 'fence') {
      const layerKey = type === 'fence' ? 'object' : 'ground';
      this.hexNeighbors(decorRow.plot_x, decorRow.plot_y).forEach(({ c: nc, r: nr }) => {
        // Only draw once per edge (toward "greater" neighbor)
        if (nr < decorRow.plot_y || (nr === decorRow.plot_y && nc <= decorRow.plot_x)) return;
        const nd = this.getDecorAt(nc, nr)[layerKey];
        if (!nd || nd.decor_type !== type) return;
        const { x: nx, y: ny } = this.hexToScreen(nc, nr);
        const mx = (cx + nx) / 2;
        const my = (cy + ny) / 2;
        const angle = Math.atan2(ny - cy, nx - cx) * (180 / Math.PI);
        const connHref = window.DecorRenderer.resolveDecorSVGPath(`${type}_connector`);
        const connSize = window.DecorRenderer.resolveDecorDisplaySize(`${type}_connector`);
        if (!connHref) return;
        const conn = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        conn.setAttribute('href', connHref);
        const yOff = type === 'fence' ? -6 : 4;
        conn.setAttribute('x', mx - connSize / 2);
        conn.setAttribute('y', my - connSize / 2 + yOff);
        conn.setAttribute('width', connSize);
        conn.setAttribute('height', connSize);
        conn.setAttribute('transform', `rotate(${angle} ${mx} ${my + yOff})`);
        conn.setAttribute('class', type === 'fence' ? 'game-fence-connector' : 'game-path-connector');
        g.appendChild(conn);
      });
    }

    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', href);
    image.setAttribute('x', cx - size / 2);
    image.setAttribute('y', cy - size + (decorRow.layer === 'ground' ? 16 : 6));
    image.setAttribute('width', size);
    image.setAttribute('height', size);
    if (decorRow.layer === 'object') {
      // Soft warm tint only — no hard halo
      const inNight = luminous && this.state.isNight;
      image.setAttribute('filter', inNight ? 'url(#game-night-glow)' : 'url(#game-plant-shadow)');
      if (inNight) {
        // Keep glow levels relative to the house porch light:
        // lantern < house, campfire > lantern, campfire < house.
        const nightOpacity = type === 'lantern' ? 0.72 : (type === 'campfire' ? 0.92 : 1);
        image.setAttribute('opacity', String(nightOpacity));
      }
    }
    g.appendChild(image);
    return g;
  },

  /** Soft yellowish-orange light pools + fireflies for night mode. */
  buildNightLayer(world) {
    const existing = world.querySelector('#game-night-layer');
    if (existing) existing.remove();

    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('id', 'game-night-layer');
    layer.setAttribute('pointer-events', 'none');

    // Night-only: glow/overlay/fireflies. Smoke is rendered in both day and night.
    if (this.state.isNight) {
      const lights = [];
      // Cottage — soft ambient porch light (reference for "glow relative strength").
      lights.push({ x: 177, y: 305, r: 95, kind: 'house', opacity: 0.62 });

      this.state.decorList.forEach((d) => {
        if (!this.luminousDecorTypes().has(d.decor_type)) return;
        const { x, y } = this.hexToScreen(d.plot_x, d.plot_y);
        const kind = d.decor_type;
        // Keep relative glow strengths:
        // lantern < campfire < house
        const r = kind === 'campfire' ? 78 : 62;
        const opacity = kind === 'campfire' ? 0.52 : 0.40;
        lights.push({ x, y: y - 16, r, kind, opacity });
      });

      const maskId = 'night-light-mask';
      const defs = this.els.svg.querySelector('#game-scene-defs');
      if (defs) {
        const oldMask = defs.querySelector(`#${maskId}`);
        if (oldMask) oldMask.remove();
        const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
        mask.setAttribute('id', maskId);
        // Soft-edged holes via heavy blur so light falls off gently
        let holes = `<rect x="-1200" y="-1200" width="3424" height="3424" fill="white"/>`;
        lights.forEach((L) => {
          holes += `<circle cx="${L.x}" cy="${L.y}" r="${L.r}" fill="black" filter="url(#soft-mask-blur)"/>`;
        });
        mask.innerHTML = holes;
        defs.appendChild(mask);
      }

      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      overlay.setAttribute('x', -1200);
      overlay.setAttribute('y', -1200);
      overlay.setAttribute('width', 3424);
      overlay.setAttribute('height', 3424);
      overlay.setAttribute('fill', '#0a1830');
      overlay.setAttribute('opacity', '0.58');
      overlay.setAttribute('mask', `url(#${maskId})`);
      overlay.setAttribute('class', 'game-night-overlay');
      layer.appendChild(overlay);

      // Faint yellowish-orange glow — large, blurred, low opacity
      lights.forEach((L) => {
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const baseR = L.r * 1.15;
        glow.setAttribute('cx', L.x);
        glow.setAttribute('cy', L.y);
        glow.setAttribute('r', baseR);
        glow.setAttribute('fill', 'url(#night-lamp-glow)');
        glow.setAttribute('opacity', String(L.opacity ?? 0.55));
        glow.setAttribute('filter', 'url(#soft-light-blur)');
        glow.setAttribute('class', 'game-night-lamp');

        // Campfire glow flickers gently by breathing in/out over time.
        if (L.kind === 'campfire') {
          const radiusAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
          radiusAnim.setAttribute('attributeName', 'r');
          radiusAnim.setAttribute('values', `${baseR};${baseR * 1.22};${baseR * 0.80};${baseR * 1.16};${baseR * 0.88};${baseR}`);
          radiusAnim.setAttribute('dur', '1.7s');
          radiusAnim.setAttribute('repeatCount', 'indefinite');
          glow.appendChild(radiusAnim);

          const opacityAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
          opacityAnim.setAttribute('attributeName', 'opacity');
          opacityAnim.setAttribute('values', `${L.opacity ?? 0.52};${(L.opacity ?? 0.52) + 0.18};${(L.opacity ?? 0.52) - 0.18};${(L.opacity ?? 0.52) + 0.12};${(L.opacity ?? 0.52) - 0.10};${L.opacity ?? 0.52}`);
          opacityAnim.setAttribute('dur', '1.35s');
          opacityAnim.setAttribute('repeatCount', 'indefinite');
          glow.appendChild(opacityAnim);
        }

        layer.appendChild(glow);
      });

      // Fireflies around lanterns only
      this.state.decorList.forEach((d, di) => {
        if (d.decor_type !== 'lantern') return;
        const { x, y } = this.hexToScreen(d.plot_x, d.plot_y);
        const lx = x;
        const ly = y - 22;
        for (let i = 0; i < 4; i++) {
          const fly = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          fly.setAttribute('class', 'game-firefly');
          const r = 1.1 + (i % 2) * 0.35;
          fly.innerHTML = `
            <circle cx="0" cy="0" r="${r}" fill="#ffc86a" opacity="0.75">
              <animate attributeName="opacity" values="0.15;0.8;0.25;0.7;0.15" dur="${2.4 + i * 0.4}s" begin="${i * 0.3}s" repeatCount="indefinite"/>
            </circle>
            <animateMotion dur="${5 + i * 1.2}s" begin="${di * 0.2 + i * 0.5}s" repeatCount="indefinite"
              path="M ${lx} ${ly} q ${12 + i * 4} ${-10 - i * 2} ${8 + i} ${6} q ${-10} ${12} ${-14} ${2} q ${-6} ${-10} ${-4} ${-14} q ${10} ${-4} ${10} ${6} Z"/>
          `;
          layer.appendChild(fly);
        }
      });
    }

    // Smoke particles around campfires.
    this.state.decorList.forEach((d, di) => {
      if (d.decor_type !== 'campfire') return;
      const { x, y } = this.hexToScreen(d.plot_x, d.plot_y);
      const sx = x;
      const sy = y - 6; // start near the base of the campfire

      const colors = [
        '#121212', // black
        '#ededed', // white-ish
        '#5a5a5a', // dark grey
      ];

      const particleCount = 12;
      for (let i = 0; i < particleCount; i++) {
        const smoke = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        smoke.setAttribute('class', 'game-campfire-smoke');
        smoke.setAttribute('filter', 'url(#soft-blur)');

        const color = colors[i % colors.length];
        const rx = 3.0 + i * 0.22;
        const ry = 2.1 + i * 0.14;
        const dur = 9.5 + i * 0.22;
        const begin = di * 0.25 + i * 0.33;

        // Upwards movement (negative y deltas) with some horizontal drift.
        const drift1 = (i % 2 ? 1 : -1) * (8 + i * 0.55);
        const drift2 = (i % 3 - 1) * (6 + i * 0.45);
        const rise1 = 18 + i * 1.9;
        const rise2 = 48 + i * 3.1;

        smoke.innerHTML = `
          <ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="${color}" opacity="0.14">
            <animate attributeName="opacity" values="0.12;0.70;0.28;0.12" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
            <animate attributeName="rx" values="${rx};${rx * 1.15};${rx * 0.65}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
            <animate attributeName="ry" values="${ry};${ry * 1.1};${ry * 0.65}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
          </ellipse>
          <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite"
            path="M ${sx} ${sy} q ${drift1} ${-rise1} ${drift2} ${-rise2}"/>
        `;
        layer.appendChild(smoke);
      }
    });

    world.appendChild(layer);
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
    let elapsedSeconds = Math.max(0, (now.getTime() - plantedAt) / 1000);
    elapsedSeconds *= this.growthMultiplier(); // sunny weather accelerates growth
    const boostSeconds = (plant.water_boosts || 0) * config.boost;

    const effectiveSeconds = elapsedSeconds + boostSeconds;
    const stageDuration = config.growTime / 4;

    const stage = Math.floor(effectiveSeconds / stageDuration);
    return Math.min(4, Math.max(0, stage));
  },

  growthPercent(plant, now = new Date()) {
    const config = this.config.plants[plant.plant_type];
    if (!config) return 0;
    const plantedAt = new Date(plant.planted_at).getTime();
    let elapsedSeconds = Math.max(0, (now.getTime() - plantedAt) / 1000);
    elapsedSeconds *= this.growthMultiplier();
    const boostSeconds = (plant.water_boosts || 0) * config.boost;
    return this.clamp(Math.round(((elapsedSeconds + boostSeconds) / config.growTime) * 100), 0, 100);
  },

  isPlantWilted(plant, now = new Date()) {
    if (this.state.weather?.key === 'rainy') return false; // rain keeps everything watered
    const stage = this.calculatePlantStage(plant, now);
    if (stage === 4) return false; // Bloom stage cannot wilt

    const lastWatered = new Date(plant.last_watered_at || plant.planted_at).getTime();
    const secondsSinceWater = (now.getTime() - lastWatered) / 1000;

    return secondsSinceWater > this.config.wiltTimeout;
  },

  async handlePlotClick(c, r, plot, plant) {
    if (this.state.selectedTool === 'remove') {
      await this.removeDecorAt(c, r);
      return;
    }

    if (this.state.selectedDecor) {
      await this.placeDecor(c, r);
      return;
    }

    if (plot && plant) {
      const stage = this.calculatePlantStage(plant);
      if (this.state.selectedTool === 'fertilizer') {
        await this.applyFertilizer(plant, stage);
      } else if (stage >= 4) {
        await this.harvestPlant(plant);
      } else {
        await this.waterPlant(plant);
      }
    } else {
      // Block planting on object décor
      if (this.getDecorAt(c, r).object) {
        this.toast('This spot has décor — pick it up first, or plant elsewhere', 'warning');
        return;
      }
      await this.plantSeed(c, r);
    }
  },

  async placeDecor(c, r) {
    if (!this.state.selectedDecor) {
      this.toast('Select a décor item first', 'warning');
      return;
    }
    if (!window.DecorRenderer) {
      this.toast('Decor renderer missing', 'error');
      return;
    }

    const decorType = this.state.selectedDecor;
    const config = this.config.decor[decorType];
    if (!config) return;

    const existing = this.getDecorAt(c, r);
    const plot = this.state.plots.find(p => p.plot_x === c && p.plot_y === r);
    const plant = plot ? this.state.plantsMap[plot.id] : null;

    if (config.layer === 'object') {
      if (plant) {
        this.toast('Clear the plant before placing furniture here', 'warning');
        return;
      }
      if (existing.object) {
        this.toast('Something is already here — use Pick Up first', 'warning');
        return;
      }
    }

    const myPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;
    if (myPoints < config.cost) {
      this.toast('Not enough points for this décor', 'error');
      this.state.selectedDecor = null;
      this.setupShop();
      return;
    }

    this.showOverlay(true);
    try {
      // Replace existing ground décor of same layer (refund half of old)
      if (config.layer === 'ground' && existing.ground) {
        await this.deleteDecorRow(existing.ground, true);
      }

      const spendPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;
      if (spendPoints < config.cost) {
        this.toast('Not enough points for this décor', 'error');
        return;
      }

      const nextPoints = spendPoints - config.cost;
      const { error: pointsErr } = await window.sb
        .from('users')
        .update({ total_task_points: nextPoints })
        .eq('id', window.currentUser.id);
      if (pointsErr) throw pointsErr;
      window.userProfile.total_task_points = nextPoints;
      this.loadPoints();

      const { error: insErr } = await window.sb
        .from('garden_decor')
        .upsert({
          garden_id: this.state.garden.id,
          plot_x: c,
          plot_y: r,
          decor_type: decorType,
          layer: config.layer,
          owner_user_id: window.currentUser.id,
          placed_at: new Date().toISOString(),
        }, { onConflict: 'garden_id,plot_x,plot_y,layer' });

      if (insErr) throw insErr;

      this.toast(`Placed ${config.name}`, 'success');
      this.trackQuestEvent('decor');
      this.state.selectedDecor = null;
      await this.loadGardenState();
      this.renderGardenCanvas();
      this.setHelperText(this.defaultHelperText());
    } catch (err) {
      console.error('placeDecor error:', err);
      this.toast(err.message?.includes('garden_decor') || err.code === '42P01'
        ? 'Run supabase_garden_decor.sql in Supabase first'
        : 'Could not place décor', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  async removeDecorAt(c, r) {
    const existing = this.getDecorAt(c, r);
    const target = existing.object || existing.ground;
    if (!target) {
      this.toast('Nothing to pick up here', 'warning');
      return;
    }
    this.showOverlay(true);
    try {
      await this.deleteDecorRow(target, true);
      const cfg = this.config.decor[target.decor_type];
      this.toast(`Picked up ${cfg?.name || 'décor'}`, 'success');
      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('removeDecor error:', err);
      this.toast('Could not remove décor', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  async deleteDecorRow(row, refund) {
    const { error } = await window.sb
      .from('garden_decor')
      .delete()
      .eq('id', row.id);
    if (error) throw error;

    if (refund) {
      const cfg = this.config.decor[row.decor_type];
      const pts = Math.floor((cfg?.cost || 0) * this.config.decorRefundRate);
      if (pts > 0 && typeof window.adjustUserTaskPoints === 'function') {
        await window.adjustUserTaskPoints(pts);
        this.loadPoints();
        this.setupShop();
      }
    }
  },

  async plantSeed(c, r) {
    if (!this.state.selectedSeed) {
      this.toast('Select a seed from the toolbar first', 'warning');
      return;
    }
    if (this.getDecorAt(c, r).object) {
      this.toast('This spot has décor in the way', 'warning');
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

      if (this.isGoldenPlant(newPlant)) {
        this.toast(`✨ A GOLDEN ${config.name} sprouted! Harvests for 3× points!`, 'success');
      } else {
        this.toast(`Successfully planted ${config.name}!`, 'success');
      }
      this.state.selectedSeed = null;
      this.trackQuestEvent('plant');

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
    const isPartners = window.currentUser && plant.owner_user_id !== window.currentUser.id;

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

      this.trackQuestEvent('water');
      if (isPartners) {
        this.trackQuestEvent('partnerWater');
        if (typeof window.adjustUserTaskPoints === 'function') {
          await window.adjustUserTaskPoints(this.config.coopWaterReward);
        }
        this.toast(`Teamwork! +${this.config.coopWaterReward} pt for watering your partner's plant 💧`, 'success');
      } else {
        this.toast('Watered plant! Growth accelerated.', 'success');
      }

      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('Watering failed:', err);
      this.toast('Watering failed. Try again.', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  async harvestPlant(plant) {
    const config = this.config.plants[plant.plant_type];
    if (!config) return;
    const golden = this.isGoldenPlant(plant);
    const reward = config.harvest * (golden ? this.config.goldenMultiplier : 1);
    const isPartners = window.currentUser && plant.owner_user_id !== window.currentUser.id;

    this.showOverlay(true);
    try {
      // Remove the plant and free the plot
      const { error: delErr } = await window.sb
        .from('garden_plants')
        .delete()
        .eq('id', plant.id);
      if (delErr) throw delErr;

      await window.sb
        .from('garden_plots')
        .update({ plant_id: null })
        .eq('id', plant.plot_id);

      if (typeof window.adjustUserTaskPoints === 'function') {
        await window.adjustUserTaskPoints(reward);
      }

      this.trackQuestEvent('harvest');
      this.toast(
        golden
          ? `✨ GOLDEN ${config.name} harvested! +${reward} pts!`
          : `Harvested ${config.name}! +${reward} pts${isPartners ? ' (shared crop)' : ''}`,
        'success'
      );

      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('Harvest failed:', err);
      this.toast('Harvest failed. Try again.', 'error');
    } finally {
      this.showOverlay(false);
    }
  },

  async applyFertilizer(plant, stage) {
    if (stage >= 4) {
      this.toast('This plant is already blooming — no fertilizer needed!', 'warning');
      return;
    }
    const f = this.config.fertilizer;
    const myPoints = window.userProfile ? (window.userProfile.total_task_points ?? 0) : 0;
    if (myPoints < f.cost) {
      this.toast('Not enough points for fertilizer!', 'error');
      this.state.selectedTool = null;
      this.setupShop();
      return;
    }

    this.showOverlay(true);
    try {
      const nextPoints = myPoints - f.cost;
      const { error: pointsErr } = await window.sb
        .from('users')
        .update({ total_task_points: nextPoints })
        .eq('id', window.currentUser.id);
      if (pointsErr) throw pointsErr;
      window.userProfile.total_task_points = nextPoints;
      this.loadPoints();

      const nextBoosts = (plant.water_boosts || 0) + f.boosts;
      const { error } = await window.sb
        .from('garden_plants')
        .update({ water_boosts: nextBoosts })
        .eq('id', plant.id);
      if (error) throw error;

      this.toast(`Fertilized! Growth boosted by ${f.boosts} water boosts 🌿`, 'success');
      this.state.selectedTool = null;
      this.setupShop();

      await this.loadGardenState();
      this.renderGardenCanvas();
    } catch (err) {
      console.error('Fertilizer failed:', err);
      this.toast('Could not apply fertilizer. Try again.', 'error');
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
