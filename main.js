/**
 * NOCTIS — Ultra-High Performance Scrollytelling Engine
 * Vanilla JavaScript (ES6+), 60fps locked, Zero Forced Reflows.
 */

(function () {
  'use strict';

  const CFG = window.NOCTIS_CONFIG;
  if (!CFG) {
    console.error('NOCTIS_CONFIG not found.');
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==========================================================================
     1. HIGH-SPEED FRAME ASSET MANAGER
     Fast O(1) cache, nearest-frame memory, prioritized lookahead streaming.
     ========================================================================== */
  class FastFrameSequence {
    constructor(options) {
      this.frameCount = options.frameCount;
      this.getDesktopPath = options.desktopPath;
      this.getMobilePath = options.mobilePath;
      this.cache = new Map();
      this.isMobile = window.innerWidth <= CFG.hardware.mobileBreakpoint;
      this.initialPreloadTarget = options.initialPreloadCount || 0;
      this.lastReturnedFrame = null;
      this.activeRequests = 0;
      this.maxConcurrent = 4;
      this.pendingQueue = [];
      this.isStreaming = false;
      this.onInitialProgress = options.onProgress || null;
      this.onInitialComplete = options.onComplete || null;
    }

    getPath(index) {
      const clampIndex = Math.max(1, Math.min(index, this.frameCount));
      return this.isMobile ? this.getMobilePath(clampIndex) : this.getDesktopPath(clampIndex);
    }

    getFrame(index) {
      const clampIndex = Math.max(1, Math.min(index, this.frameCount));
      if (this.cache.has(clampIndex)) {
        const img = this.cache.get(clampIndex);
        this.lastReturnedFrame = img;
        return img;
      }
      // O(1) fallback to the most recent loaded frame
      if (this.lastReturnedFrame) {
        return this.lastReturnedFrame;
      }
      // Fast nearby search (radius 15)
      for (let r = 1; r <= 15; r++) {
        const p = clampIndex - r;
        if (p >= 1 && this.cache.has(p)) {
          this.lastReturnedFrame = this.cache.get(p);
          return this.lastReturnedFrame;
        }
        const n = clampIndex + r;
        if (n <= this.frameCount && this.cache.has(n)) {
          this.lastReturnedFrame = this.cache.get(n);
          return this.lastReturnedFrame;
        }
      }
      return null;
    }

    loadSingleFrame(index) {
      return new Promise((resolve) => {
        const clampIndex = Math.max(1, Math.min(index, this.frameCount));
        if (this.cache.has(clampIndex)) {
          resolve(this.cache.get(clampIndex));
          return;
        }

        const img = new Image();
        let settled = false;

        const onDone = () => {
          if (settled) return;
          settled = true;
          this.cache.set(clampIndex, img);
          if (!this.lastReturnedFrame) this.lastReturnedFrame = img;
          resolve(img);
        };

        const onError = () => {
          if (settled) return;
          settled = true;
          resolve(null);
        };

        const timer = setTimeout(onError, 3500);

        img.onload = () => {
          clearTimeout(timer);
          onDone();
        };

        img.onerror = () => {
          clearTimeout(timer);
          onError();
        };

        img.src = this.getPath(clampIndex);

        if (img.complete) {
          clearTimeout(timer);
          onDone();
        }
      });
    }

    async preloadInitial() {
      const target = Math.min(this.initialPreloadTarget, this.frameCount);
      if (target <= 0) {
        if (this.onInitialComplete) this.onInitialComplete();
        return;
      }

      let loaded = 0;
      const onProgress = () => {
        loaded++;
        if (this.onInitialProgress) {
          this.onInitialProgress(loaded, target);
        }
      };

      const promises = [];
      for (let i = 1; i <= target; i++) {
        promises.push(this.loadSingleFrame(i).then(onProgress));
      }

      // 3.5s maximum timeout so preloader never blocks the site
      const timeout = new Promise((res) => setTimeout(res, 3500));
      await Promise.race([Promise.all(promises), timeout]);

      if (this.onInitialComplete) {
        this.onInitialComplete();
      }
    }

    // Directional streaming: preloads frames near current user position
    prioritize(currentIndex) {
      const lookahead = 25;
      const lookbehind = 10;
      const start = Math.max(1, currentIndex - lookbehind);
      const end = Math.min(this.frameCount, currentIndex + lookahead);

      for (let i = start; i <= end; i++) {
        if (!this.cache.has(i) && !this.pendingQueue.includes(i)) {
          this.pendingQueue.unshift(i);
        }
      }
      this.pumpQueue();
    }

    startBackgroundStreaming(fromIndex = 1) {
      if (this.isStreaming) return;
      this.isStreaming = true;

      for (let i = fromIndex; i <= this.frameCount; i++) {
        if (!this.cache.has(i)) {
          this.pendingQueue.push(i);
        }
      }
      this.pumpQueue();
    }

    pumpQueue() {
      while (this.activeRequests < this.maxConcurrent && this.pendingQueue.length > 0) {
        const nextIdx = this.pendingQueue.shift();
        if (this.cache.has(nextIdx)) continue;

        this.activeRequests++;
        this.loadSingleFrame(nextIdx).finally(() => {
          this.activeRequests--;
          if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => this.pumpQueue(), { timeout: 100 });
          } else {
            setTimeout(() => this.pumpQueue(), 16);
          }
        });
      }
    }

    handleResize() {
      const newIsMobile = window.innerWidth <= CFG.hardware.mobileBreakpoint;
      if (newIsMobile !== this.isMobile) {
        this.isMobile = newIsMobile;
        this.cache.clear();
        this.lastReturnedFrame = null;
        this.preloadInitial();
      }
    }
  }

  /* ==========================================================================
     2. GLOBAL ACCELERATED SYSTEMS (Film Grain, Cursor, Navigation)
     ========================================================================== */
  function setupFilmGrain() {
    const canvas = document.getElementById('film-grain');
    if (!canvas) return;

    const tileSize = CFG.hardware.noiseTileSize || 128;
    const offscreen = document.createElement('canvas');
    offscreen.width = tileSize;
    offscreen.height = tileSize;
    const offCtx = offscreen.getContext('2d');
    const imgData = offCtx.createImageData(tileSize, tileSize);
    const buf = new Uint32Array(imgData.data.buffer);

    for (let i = 0; i < buf.length; i++) {
      const shade = (Math.random() * 255) | 0;
      buf[i] = (255 << 24) | (shade << 16) | (shade << 8) | shade;
    }
    offCtx.putImageData(imgData, 0, 0);

    const ctx = canvas.getContext('2d');
    const resizeGrain = () => {
      canvas.width = window.innerWidth + tileSize;
      canvas.height = window.innerHeight + tileSize;
      const pattern = ctx.createPattern(offscreen, 'repeat');
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resizeGrain();
    window.addEventListener('resize', resizeGrain, { passive: true });

    let lastGrain = 0;
    const grainInterval = 1000 / (CFG.hardware.noiseFps || 8);

    return function updateGrain(timestamp) {
      if (timestamp - lastGrain >= grainInterval) {
        lastGrain = timestamp;
        const shiftX = (Math.random() * tileSize) | 0;
        const shiftY = (Math.random() * tileSize) | 0;
        canvas.style.transform = `translate3d(-${shiftX}px, -${shiftY}px, 0)`;
      }
    };
  }

  function setupCursor() {
    if (!window.matchMedia('(pointer: fine)').matches || prefersReducedMotion) {
      return () => {};
    }

    const cursorEl = document.getElementById('cursor');
    if (!cursorEl) return () => {};
    const labelEl = cursorEl.querySelector('.cursor-label');

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let curX = mouseX;
    let curY = mouseY;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    window.addEventListener('mousedown', () => {
      cursorEl.classList.add('is-active');
      setTimeout(() => cursorEl.classList.remove('is-active'), 120);
    });

    document.querySelectorAll('a, button, [data-cursor-label]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const text = el.getAttribute('data-cursor-label') || 'VIEW';
        if (labelEl) labelEl.textContent = text;
        cursorEl.classList.add('is-hovering');
      });
      el.addEventListener('mouseleave', () => {
        cursorEl.classList.remove('is-hovering');
        if (labelEl) labelEl.textContent = '';
      });
    });

    window.__setCursorLabel = function (text) {
      if (labelEl) labelEl.textContent = text;
    };

    const lerp = CFG.hardware.cursorLerp || 0.18;
    return function updateCursor() {
      curX += (mouseX - curX) * lerp;
      curY += (mouseY - curY) * lerp;
      cursorEl.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
    };
  }

  function setupNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return () => {};
    let lastY = 0;

    return function updateNav(scrollY) {
      if (scrollY > lastY && scrollY > 120) {
        nav.classList.add('is-hidden');
      } else if (scrollY < lastY) {
        nav.classList.remove('is-hidden');
      }
      lastY = scrollY;
    };
  }

  /* ==========================================================================
     3. HERO CONTROLLER
     Zero forced reflow during render, sub-pixel canvas drawing.
     ========================================================================== */
  function setupHero(heroSequence) {
    const wrapper = document.getElementById('hero');
    const canvas = document.getElementById('hero-canvas');
    if (!wrapper || !canvas) return () => {};

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    const progressBar = document.getElementById('hero-progress-bar');
    const hudChapterText = document.getElementById('hud-chapter-text');
    const hudSpeedVal = document.getElementById('hud-speed-val');
    const hudDistVal = document.getElementById('hud-dist-val');

    const chapters = CFG.hero.chapters.map(ch => ({
      ...ch,
      element: document.getElementById(ch.id)
    }));

    let dpr = 1;
    let canvasW = 0;
    let canvasH = 0;
    let wrapperTop = 0;
    let wrapperH = 0;
    let lastActiveChapter = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, CFG.hardware.maxDevicePixelRatio);
      canvasW = window.innerWidth;
      canvasH = window.innerHeight;
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Cache layout positions
      wrapperTop = wrapper.offsetTop;
      wrapperH = wrapper.offsetHeight;
      lastDrawn = -1;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    let currentFrame = 1;
    let lastDrawn = -1;
    let lastProgress = -1;

    function draw(frameNum, progress) {
      const img = heroSequence.getFrame(frameNum);
      const isPortrait = canvasH > canvasW;

      if (img && img.naturalWidth) {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        if (isPortrait) {
          ctx.fillStyle = '#07080A';
          ctx.fillRect(0, 0, canvasW, canvasH);
          const scale = Math.min(canvasW / imgW, canvasH / imgH);
          const dw = imgW * scale;
          const dh = imgH * scale;
          ctx.drawImage(img, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
        } else {
          const scale = Math.max(canvasW / imgW, canvasH / imgH);
          const dw = imgW * scale;
          const dh = imgH * scale;
          ctx.drawImage(img, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
        }
      } else {
        ctx.fillStyle = '#07080A';
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // Smooth fade to black over final 5%
      if (progress >= CFG.hero.fadeToBlackStart) {
        const fade = Math.min((progress - CFG.hero.fadeToBlackStart) / (1 - CFG.hero.fadeToBlackStart), 1);
        ctx.fillStyle = `rgba(7, 8, 10, ${fade})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
    }

    return function updateHero(scrollY, windowH) {
      const maxScroll = wrapperH - windowH;
      if (maxScroll <= 0) return;

      // Pure arithmetic — zero getBoundingClientRect calls!
      const targetProgress = Math.min(Math.max((scrollY - wrapperTop) / maxScroll, 0), 1);
      const targetFrame = Math.round(targetProgress * (CFG.hero.frameCount - 1)) + 1;

      currentFrame += (targetFrame - currentFrame) * CFG.hero.lerpFactor;
      const rounded = Math.round(currentFrame);

      // Redraw only when needed
      if (rounded !== lastDrawn || Math.abs(targetProgress - lastProgress) > 0.003) {
        draw(rounded, targetProgress);
        lastDrawn = rounded;
        lastProgress = targetProgress;
        heroSequence.prioritize(rounded);
      }

      if (progressBar) {
        progressBar.style.width = `${(targetProgress * 100).toFixed(2)}%`;
      }

      // HUD and Chapter updates
      const activeCh = chapters.find(ch => targetProgress >= ch.start && targetProgress <= ch.end) || chapters[0];
      if (activeCh !== lastActiveChapter) {
        lastActiveChapter = activeCh;
        chapters.forEach(ch => {
          if (!ch.element) return;
          const active = ch === activeCh;
          ch.element.classList.toggle('is-active', active);
          if (active) ch.element.classList.add('is-revealed');
        });
        if (hudChapterText) hudChapterText.textContent = activeCh.hudChapter;
      }

      if (hudSpeedVal) {
        const speed = Math.round(targetProgress * CFG.hero.telemetry.speedMax);
        hudSpeedVal.textContent = String(speed).padStart(3, '0');
      }
      if (hudDistVal) {
        hudDistVal.textContent = (targetProgress * CFG.hero.telemetry.distanceMax).toFixed(1);
      }
    };
  }

  /* ==========================================================================
     4. STATEMENT CONTROLLER
     ========================================================================== */
  function setupStatement() {
    const section = document.getElementById('statement');
    const quote = document.getElementById('statement-quote');
    if (!section || !quote) return () => {};

    const words = quote.querySelectorAll('.word');
    let sectionTop = 0;
    let sectionH = 0;

    function resize() {
      sectionTop = section.offsetTop;
      sectionH = section.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    return function updateStatement(scrollY, windowH) {
      if (scrollY + windowH < sectionTop || scrollY > sectionTop + sectionH) return;

      const start = sectionTop - windowH * 0.85;
      const end = sectionTop - windowH * 0.20;
      const progress = Math.min(Math.max((scrollY - start) / (end - start), 0), 1);

      const total = words.length;
      words.forEach((w, i) => {
        const wStart = i / total;
        const wEnd = (i + 1) / total;
        let wp = 0;
        if (progress > wStart) {
          wp = Math.min((progress - wStart) / (wEnd - wStart), 1);
        }
        w.style.opacity = (0.15 + 0.85 * wp).toFixed(2);
        w.style.color = wp >= 0.95 ? 'var(--bone)' : 'var(--fog)';
      });
    };
  }

  /* ==========================================================================
     5. DISMANTLE CONTROLLER
     ========================================================================== */
  function setupDismantle(dismantleSequence) {
    const wrapper = document.getElementById('dismantle');
    const canvas = document.getElementById('dismantle-canvas');
    const calloutsLayer = document.getElementById('dismantle-callouts-layer');
    const progressBar = document.getElementById('dismantle-progress-bar');
    if (!wrapper || !canvas || !calloutsLayer) return () => {};

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    let dpr = 1;
    let canvasW = 0;
    let canvasH = 0;
    let wrapperTop = 0;
    let wrapperH = 0;
    let carBounds = { x: 0, y: 0, width: 0, height: 0 };

    // Build callouts DOM
    calloutsLayer.innerHTML = '';
    const calloutItems = CFG.dismantle.callouts.map((c) => {
      const container = document.createElement('div');
      container.className = 'callout-item';
      container.id = `callout-${c.id}`;
      container.innerHTML = `
        <svg class="callout-svg">
          <line class="callout-line" x1="0" y1="0" x2="0" y2="0"></line>
          <circle class="callout-dot" cx="0" cy="0" r="3"></circle>
        </svg>
        <div class="callout-card">
          <span class="callout-tag mono-hud">${c.label}</span>
          <span class="callout-desc">${c.text}</span>
        </div>
      `;
      calloutsLayer.appendChild(container);
      return {
        config: c,
        container,
        line: container.querySelector('.callout-line'),
        dot: container.querySelector('.callout-dot'),
        card: container.querySelector('.callout-card')
      };
    });

    function updateCallouts() {
      calloutItems.forEach((item) => {
        const c = item.config;
        const dotX = carBounds.x + (c.dotX / 100) * carBounds.width;
        const dotY = carBounds.y + (c.dotY / 100) * carBounds.height;
        const labelX = (c.labelX / 100) * canvasW;
        const labelY = (c.labelY / 100) * canvasH;

        item.dot.setAttribute('cx', dotX);
        item.dot.setAttribute('cy', dotY);
        item.line.setAttribute('x1', dotX);
        item.line.setAttribute('y1', dotY);
        item.line.setAttribute('x2', labelX);
        item.line.setAttribute('y2', labelY);
        item.card.style.left = `${labelX}px`;
        item.card.style.top = `${labelY}px`;
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, CFG.hardware.maxDevicePixelRatio);
      canvasW = window.innerWidth;
      canvasH = window.innerHeight;
      canvas.width = canvasW * dpr;
      canvas.height = canvasH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      wrapperTop = wrapper.offsetTop;
      wrapperH = wrapper.offsetHeight;
      lastDrawn = -1;
      updateCallouts();
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    let currentFrame = 1;
    let lastDrawn = -1;

    function draw(frameNum) {
      ctx.fillStyle = '#07080A';
      ctx.fillRect(0, 0, canvasW, canvasH);

      const img = dismantleSequence.getFrame(frameNum);
      if (img && img.naturalWidth) {
        const isPortrait = canvasH > canvasW;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        let dw, dh, dx, dy;

        if (isPortrait) {
          const scale = Math.min(canvasW / imgW, canvasH / imgH);
          dw = imgW * scale;
          dh = imgH * scale;
          dx = (canvasW - dw) / 2;
          dy = (canvasH - dh) / 2;
        } else {
          const scale = Math.max(canvasW / imgW, canvasH / imgH);
          dw = imgW * scale;
          dh = imgH * scale;
          dx = (canvasW - dw) / 2;
          dy = (canvasH - dh) / 2;
        }

        ctx.drawImage(img, dx, dy, dw, dh);
        carBounds = { x: dx, y: dy, width: dw, height: dh };
        updateCallouts();
      }
    }

    return function updateDismantle(scrollY, windowH) {
      if (scrollY + windowH < wrapperTop || scrollY > wrapperTop + wrapperH) return;

      const maxScroll = wrapperH - windowH;
      if (maxScroll <= 0) return;

      const targetProgress = Math.min(Math.max((scrollY - wrapperTop) / maxScroll, 0), 1);
      const targetFrame = Math.round(targetProgress * (CFG.dismantle.frameCount - 1)) + 1;

      currentFrame += (targetFrame - currentFrame) * CFG.dismantle.lerpFactor;
      const rounded = Math.round(currentFrame);

      if (rounded !== lastDrawn) {
        draw(rounded);
        lastDrawn = rounded;
        dismantleSequence.prioritize(rounded);
      }

      if (progressBar) {
        progressBar.style.width = `${(targetProgress * 100).toFixed(2)}%`;
      }

      calloutItems.forEach((item) => {
        const show = targetProgress >= item.config.threshold;
        item.container.classList.toggle('is-visible', show);
      });
    };
  }

  /* ==========================================================================
     6. LINEUP ACCORDION (Desktop Flex-Grow & Mobile Stacks)
     ========================================================================== */
  function setupLineup() {
    const section = document.getElementById('lineup');
    const container = document.getElementById('lineup-accordion');
    const header = section ? section.querySelector('.lineup-top-header') : null;
    if (!section || !container) return;

    // Fast reveal on intersection
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          section.classList.add('is-revealed');
          if (header) header.classList.add('is-revealed');
          obs.unobserve(section);
        }
      });
    }, { threshold: 0.1 });
    obs.observe(section);

    container.innerHTML = '';
    const cars = CFG.lineup.cars;

    cars.forEach((car, index) => {
      const isOpen = index === 0;
      const slide = document.createElement('div');
      slide.className = `lineup-slide ${isOpen ? 'is-open' : ''}`;
      slide.setAttribute('role', 'button');
      slide.setAttribute('tabindex', '0');
      slide.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      slide.setAttribute('aria-label', `Model ${car.name}`);
      slide.setAttribute('data-cursor-label', isOpen ? 'CONFIGURE' : 'OPEN');

      slide.innerHTML = `
        <img class="slide-bg-thumb" src="${car.image}" alt="${car.alt}" loading="lazy" />
        <div class="slide-closed-view" aria-hidden="true">
          <span class="closed-num mono-hud">${car.number}</span>
          <span class="closed-name mono-hud">${car.name}</span>
        </div>
        <div class="open-car-container" aria-hidden="true">
          <img class="open-car-img" src="${car.image}" alt="${car.alt}" loading="lazy" />
        </div>
        <div class="slide-open-view">
          <div class="open-header">
            <span class="open-number mono-hud">${car.number} — MODEL</span>
            <h3 class="open-model-name display-title">${car.name}</h3>
          </div>
          <div class="open-footer">
            <p class="open-tagline">${car.tagline}</p>
            <div class="open-specs-row mono-hud">
              ${car.specs.map(s => `
                <div class="spec-col">
                  <span class="spec-lbl">${s.label}</span>
                  <span class="spec-val">${s.value}</span>
                </div>
              `).join('')}
            </div>
            <div class="open-controls-row">
              <div class="swatches-row" role="group" aria-label="Color Palette">
                ${car.colors.map((c, i) => `
                  <button type="button" class="color-swatch ${i === 0 ? 'is-active' : ''}" 
                          style="background-color: ${c.hex};" 
                          title="${c.name}"
                          aria-label="${c.name}">
                  </button>
                `).join('')}
              </div>
              <a href="#reserve" class="configure-link mono-hud" data-cursor-label="CONFIGURE">Configure →</a>
            </div>
          </div>
        </div>
      `;
      container.appendChild(slide);
    });

    const slides = Array.from(container.querySelectorAll('.lineup-slide'));
    let activeIdx = 0;
    let hoverTimer = null;

    function open(idx) {
      if (idx === activeIdx && slides[idx].classList.contains('is-open')) return;
      slides.forEach((s, i) => {
        const matches = i === idx;
        s.classList.toggle('is-open', matches);
        s.setAttribute('aria-expanded', matches ? 'true' : 'false');
        s.setAttribute('data-cursor-label', matches ? 'CONFIGURE' : 'OPEN');
      });
      activeIdx = idx;
      if (window.__setCursorLabel) {
        window.__setCursorLabel('CONFIGURE');
      }
    }

    slides.forEach((s, i) => {
      s.querySelectorAll('.color-swatch').forEach((swatch) => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          s.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('is-active'));
          swatch.classList.add('is-active');
        });
      });

      s.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => open(i), CFG.lineup.debounceHoverMs || 80);
      });
      s.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
      s.addEventListener('click', () => {
        clearTimeout(hoverTimer);
        open(i);
      });

      s.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nxt = (i + 1) % slides.length;
          slides[nxt].focus();
          open(nxt);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prv = (i - 1 + slides.length) % slides.length;
          slides[prv].focus();
          open(prv);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      });
    });
  }

  /* ==========================================================================
     7. PRELOADER CONTROLLER
     ========================================================================== */
  function setupPreloader(heroSequence, dismantleSequence) {
    const preloaderEl = document.getElementById('preloader');
    const barEl = document.getElementById('preloader-bar');
    const counterEl = document.getElementById('preloader-counter');

    let dismissed = false;

    function updateDisplay(pct) {
      const clamped = Math.min(Math.max(pct, 0), 100);
      if (barEl) barEl.style.width = `${clamped}%`;
      if (counterEl) counterEl.textContent = String(Math.round(clamped)).padStart(3, '0');
    }

    heroSequence.onInitialProgress = (loaded, total) => {
      if (dismissed) return;
      updateDisplay((loaded / total) * 100);
    };

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;

      updateDisplay(100);
      if (barEl) barEl.classList.add('flash-exit');

      setTimeout(() => {
        if (preloaderEl) preloaderEl.classList.add('is-finished');

        const ch1 = document.getElementById('hero-ch1');
        if (ch1) {
          ch1.classList.add('is-active');
          ch1.classList.add('is-revealed');
        }

        // Start throttled directional background streaming
        heroSequence.startBackgroundStreaming(heroSequence.initialPreloadTarget + 1);
        setTimeout(() => dismantleSequence.startBackgroundStreaming(1), 1000);
      }, 300);
    };

    heroSequence.onInitialComplete = dismiss;
    setTimeout(dismiss, 3500); // Failsafe

    heroSequence.preloadInitial();
  }

  /* ==========================================================================
     8. UNIFIED 60FPS MASTER TICK (Single requestAnimationFrame loop)
     ========================================================================== */
  function initApp() {
    try {
      const heroSequence = new FastFrameSequence({
        frameCount: CFG.hero.frameCount,
        desktopPath: CFG.hero.desktopPath,
        mobilePath: CFG.hero.mobilePath,
        initialPreloadCount: CFG.hero.initialPreloadCount
      });

      const dismantleSequence = new FastFrameSequence({
        frameCount: CFG.dismantle.frameCount,
        desktopPath: CFG.dismantle.desktopPath,
        mobilePath: CFG.dismantle.mobilePath,
        initialPreloadCount: 0
      });

      window.addEventListener('resize', () => {
        heroSequence.handleResize();
        dismantleSequence.handleResize();
      }, { passive: true });

      // Start preloader immediately
      setupPreloader(heroSequence, dismantleSequence);

      // Setup controllers
      const updateGrain = setupFilmGrain();
      const updateCursor = setupCursor();
      const updateNav = setupNav();
      const updateHero = setupHero(heroSequence);
      const updateStatement = setupStatement();
      const updateDismantle = setupDismantle(dismantleSequence);
      setupLineup();

      // Master Tick Loop — locked 60fps with zero layout thrashing
      let lastScrollY = window.scrollY;
      let windowH = window.innerHeight;

      window.addEventListener('resize', () => {
        windowH = window.innerHeight;
      }, { passive: true });

      function masterTick(timestamp) {
        const scrollY = window.scrollY;

        if (updateGrain) updateGrain(timestamp);
        if (updateCursor) updateCursor();
        if (updateNav) updateNav(scrollY);

        updateHero(scrollY, windowH);
        updateStatement(scrollY, windowH);
        updateDismantle(scrollY, windowH);

        lastScrollY = scrollY;
        requestAnimationFrame(masterTick);
      }

      requestAnimationFrame(masterTick);

    } catch (e) {
      console.error('Fatal initialization error:', e);
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.classList.add('is-finished');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
