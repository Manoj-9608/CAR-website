/**
 * NOCTIS — Scrollytelling Engine & Interactive Controller
 * Vanilla JavaScript (ES6+), zero frameworks, 60fps target.
 */

(function () {
  'use strict';

  const CFG = window.NOCTIS_CONFIG;
  if (!CFG) {
    console.error('NOCTIS_CONFIG not found.');
    return;
  }

  // Detect Reduced Motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==========================================================================
     1. FRAME ASSET MANAGER & BACKGROUND STREAMER
     ========================================================================== */
  class FrameSequence {
    constructor(options) {
      this.frameCount = options.frameCount;
      this.getDesktopPath = options.desktopPath;
      this.getMobilePath = options.mobilePath;
      this.cache = new Map();
      this.loadedIndices = new Set();
      this.isMobile = window.innerWidth <= CFG.hardware.mobileBreakpoint;
      this.loadQueue = [];
      this.isStreaming = false;
      this.onInitialLoadProgress = options.onProgress || null;
      this.onInitialLoadComplete = options.onComplete || null;
      this.initialPreloadTarget = options.initialPreloadCount || 0;
      this.initialLoadedCount = 0;
    }

    getPath(index) {
      const clampIndex = Math.max(1, Math.min(index, this.frameCount));
      return this.isMobile ? this.getMobilePath(clampIndex) : this.getDesktopPath(clampIndex);
    }

    getFrame(index) {
      const clampIndex = Math.max(1, Math.min(index, this.frameCount));
      if (this.cache.has(clampIndex)) {
        return this.cache.get(clampIndex);
      }
      // Nearest loaded frame fallback
      let offset = 1;
      while (offset < this.frameCount) {
        const prev = clampIndex - offset;
        if (prev >= 1 && this.cache.has(prev)) return this.cache.get(prev);
        const next = clampIndex + offset;
        if (next <= this.frameCount && this.cache.has(next)) return this.cache.get(next);
        offset++;
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
          this.loadedIndices.add(clampIndex);
          resolve(img);
        };

        const onError = () => {
          if (settled) return;
          settled = true;
          resolve(null);
        };

        // Safety timeout so no single frame hangs the pipeline
        const timer = setTimeout(onError, 3000);

        const finish = () => {
          clearTimeout(timer);
          if (typeof img.decode === 'function') {
            img.decode().then(onDone).catch(onDone);
          } else {
            onDone();
          }
        };

        // Attach listeners BEFORE assigning src
        img.onload = finish;
        img.onerror = () => {
          clearTimeout(timer);
          onError();
        };

        img.src = this.getPath(clampIndex);

        // If already cached or complete, finish immediately
        if (img.complete) {
          finish();
        }
      });
    }

    async preloadInitial() {
      const target = Math.min(this.initialPreloadTarget, this.frameCount);
      if (target <= 0) {
        if (this.onInitialLoadComplete) this.onInitialLoadComplete();
        return;
      }

      let loadedCount = 0;
      const onFrameLoaded = () => {
        loadedCount++;
        if (this.onInitialLoadProgress) {
          this.onInitialLoadProgress(loadedCount, target);
        }
      };

      // Preload initial frames in parallel
      const framePromises = [];
      for (let i = 1; i <= target; i++) {
        framePromises.push(this.loadSingleFrame(i).then(onFrameLoaded));
      }

      // Hard safety timeout: Never freeze the site for more than 3.5 seconds
      const safetyTimeout = new Promise((resolve) => setTimeout(resolve, 3500));

      await Promise.race([
        Promise.all(framePromises),
        safetyTimeout
      ]);

      if (this.onInitialLoadComplete) {
        this.onInitialLoadComplete();
      }
    }

    startBackgroundStreaming(fromIndex = 1) {
      if (this.isStreaming) return;
      this.isStreaming = true;

      // Fill load queue for remaining frames in sequential order
      for (let i = fromIndex; i <= this.frameCount; i++) {
        if (!this.cache.has(i)) {
          this.loadQueue.push(i);
        }
      }

      const streamNext = async () => {
        if (this.loadQueue.length === 0) {
          this.isStreaming = false;
          return;
        }
        const nextIndex = this.loadQueue.shift();
        await this.loadSingleFrame(nextIndex);
        
        // Yield to browser main thread
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(streamNext, { timeout: 80 });
        } else {
          setTimeout(streamNext, 16);
        }
      };

      streamNext();
    }

    handleResize() {
      const newIsMobile = window.innerWidth <= CFG.hardware.mobileBreakpoint;
      if (newIsMobile !== this.isMobile) {
        this.isMobile = newIsMobile;
        this.cache.clear();
        this.loadedIndices.clear();
        this.preloadInitial();
      }
    }
  }

  /* ==========================================================================
     2. GLOBAL FILM-GRAIN OVERLAY
     Offscreen noise tile shifted ~8 times per second, 3.5% opacity, no vignette.
     ========================================================================== */
  function initFilmGrain() {
    const canvas = document.getElementById('film-grain');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tileSize = CFG.hardware.noiseTileSize;

    // Create offscreen noise pattern
    const offscreen = document.createElement('canvas');
    offscreen.width = tileSize;
    offscreen.height = tileSize;
    const offCtx = offscreen.getContext('2d');
    const imgData = offCtx.createImageData(tileSize, tileSize);
    const buffer = new Uint32Array(imgData.data.buffer);

    for (let i = 0; i < buffer.length; i++) {
      const shade = (Math.random() * 255) | 0;
      // RGBA in 32-bit: (alpha << 24) | (blue << 16) | (green << 8) | red
      buffer[i] = (255 << 24) | (shade << 16) | (shade << 8) | shade;
    }
    offCtx.putImageData(imgData, 0, 0);

    let pattern;
    const resizeGrain = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      pattern = ctx.createPattern(offscreen, 'repeat');
    };
    resizeGrain();
    window.addEventListener('resize', resizeGrain, { passive: true });

    let lastTime = 0;
    const interval = 1000 / CFG.hardware.noiseFps;

    function renderGrain(timestamp) {
      if (timestamp - lastTime >= interval) {
        lastTime = timestamp;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        // Shift pattern randomly
        const shiftX = (Math.random() * tileSize) | 0;
        const shiftY = (Math.random() * tileSize) | 0;
        ctx.translate(shiftX, shiftY);
        ctx.fillStyle = pattern;
        ctx.fillRect(-shiftX, -shiftY, canvas.width + tileSize, canvas.height + tileSize);
        ctx.restore();
      }
      requestAnimationFrame(renderGrain);
    }
    requestAnimationFrame(renderGrain);
  }

  /* ==========================================================================
     3. CUSTOM HEADLIGHT CURSOR
     6px dot inside 28px ring (1px stroke), follows mouse with lerp 0.18.
     Morphs into 44x2px light bar with mono label over interactive targets.
     Mousedown triggers 120ms white flash.
     ========================================================================== */
  function initCustomCursor() {
    if (!window.matchMedia('(pointer: fine)').matches || prefersReducedMotion) {
      return;
    }

    const cursorEl = document.getElementById('cursor');
    if (!cursorEl) return;
    const labelEl = cursorEl.querySelector('.cursor-label');

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;
    let isHovering = false;
    let currentLabel = '';

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    // Click flash effect (120ms pure white)
    window.addEventListener('mousedown', () => {
      cursorEl.classList.add('is-active');
      setTimeout(() => {
        cursorEl.classList.remove('is-active');
      }, 120);
    });

    // Update cursor target on hover
    function bindCursorInteractions() {
      const targets = document.querySelectorAll('a, button, [data-cursor-label], .lineup-slide');
      targets.forEach((el) => {
        el.addEventListener('mouseenter', () => {
          isHovering = true;
          currentLabel = el.getAttribute('data-cursor-label') || 'VIEW';
          labelEl.textContent = currentLabel;
          cursorEl.classList.add('is-hovering');
        });

        el.addEventListener('mouseleave', () => {
          isHovering = false;
          cursorEl.classList.remove('is-hovering');
          labelEl.textContent = '';
        });
      });
    }
    bindCursorInteractions();

    // Lerp animation loop
    function updateCursor() {
      const lerp = CFG.hardware.cursorLerp;
      currentX += (mouseX - currentX) * lerp;
      currentY += (mouseY - currentY) * lerp;
      cursorEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      requestAnimationFrame(updateCursor);
    }
    requestAnimationFrame(updateCursor);

    // Expose method to dynamically update cursor label
    window.__setCursorLabel = function (text) {
      if (labelEl) {
        labelEl.textContent = text;
      }
    };
  }

  /* ==========================================================================
     4. NAVBAR SCROLL DIRECTION DETECTION
     Transparent, mix-blend-mode: difference. Hides on scroll down, shows on up.
     ========================================================================== */
  function initNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 120) {
        nav.classList.add('is-hidden');
      } else {
        nav.classList.remove('is-hidden');
      }
      lastScrollY = currentScrollY;
    }, { passive: true });
  }

  /* ==========================================================================
     5. HERO PINNED SCROLLYTELLING ENGINE
     Full-screen canvas scrubbing 718 joined hero frames.
     HUD telemetry, sky chapter reveals, 1px bottom progress line,
     canvas fade to solid black over the final 5% (0.95–1.00).
     ========================================================================== */
  function initHeroScrolly(heroSequence) {
    const wrapper = document.getElementById('hero');
    const canvas = document.getElementById('hero-canvas');
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext('2d');
    const progressBar = document.getElementById('hero-progress-bar');
    const hudChapterText = document.getElementById('hud-chapter-text');
    const hudSpeedVal = document.getElementById('hud-speed-val');
    const hudDistVal = document.getElementById('hud-dist-val');

    const chapters = CFG.hero.chapters.map(ch => ({
      ...ch,
      element: document.getElementById(ch.id)
    }));

    let currentFrame = 1;
    let targetFrame = 1;
    let targetProgress = 0;
    let currentProgress = 0;
    let lastDrawnFrame = -1;
    let lastRenderedProgress = -1;

    let canvasWidth = 0;
    let canvasHeight = 0;
    let dpr = 1;

    function resizeCanvas() {
      dpr = Math.min(window.devicePixelRatio || 1, CFG.hardware.maxDevicePixelRatio);
      canvasWidth = window.innerWidth;
      canvasHeight = window.innerHeight;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastDrawnFrame = -1; // Force immediate redraw
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    function renderCanvas(frameNum, progress) {
      ctx.fillStyle = '#07080A'; // --asphalt
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const img = heroSequence.getFrame(frameNum);
      if (img && img.naturalWidth) {
        const isPortrait = canvasHeight > canvasWidth;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        let drawW, drawH, drawX, drawY;

        if (isPortrait) {
          // Contain-fit vertically centered on portrait screens
          const scale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
          drawW = imgW * scale;
          drawH = imgH * scale;
          drawX = (canvasWidth - drawW) / 2;
          drawY = (canvasHeight - drawH) / 2;
        } else {
          // Cover-fit on landscape screens
          const scale = Math.max(canvasWidth / imgW, canvasHeight / imgH);
          drawW = imgW * scale;
          drawH = imgH * scale;
          drawX = (canvasWidth - drawW) / 2;
          drawY = (canvasHeight - drawH) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }

      // Over the last 5% of scroll (0.95 -> 1.00), fade canvas to solid black/asphalt
      if (progress >= CFG.hero.fadeToBlackStart) {
        const fadeAlpha = Math.min((progress - CFG.hero.fadeToBlackStart) / (1 - CFG.hero.fadeToBlackStart), 1);
        ctx.fillStyle = `rgba(7, 8, 10, ${fadeAlpha})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    }

    function updateChapters(progress) {
      chapters.forEach((ch) => {
        if (!ch.element) return;
        const isActive = progress >= ch.start && progress <= ch.end;
        if (isActive && !ch.element.classList.contains('is-active')) {
          ch.element.classList.add('is-active');
          ch.element.classList.add('is-revealed');
        } else if (!isActive && ch.element.classList.contains('is-active')) {
          ch.element.classList.remove('is-active');
        }
      });

      // Update active HUD chapter tick & label
      const activeCh = chapters.find(ch => progress >= ch.start && progress <= ch.end) || chapters[0];
      if (hudChapterText && activeCh.hudChapter) {
        hudChapterText.textContent = activeCh.hudChapter;
      }

      // Update speed & distance telemetry
      if (hudSpeedVal) {
        const speed = Math.round(progress * CFG.hero.telemetry.speedMax);
        hudSpeedVal.textContent = String(speed).padStart(3, '0');
      }
      if (hudDistVal) {
        const dist = (progress * CFG.hero.telemetry.distanceMax).toFixed(1);
        hudDistVal.textContent = dist;
      }
    }

    function scrollyLoop() {
      // Calculate scroll progress relative to wrapper height
      const rect = wrapper.getBoundingClientRect();
      const maxScroll = wrapper.offsetHeight - window.innerHeight;
      targetProgress = maxScroll > 0 ? Math.min(Math.max(-rect.top / maxScroll, 0), 1) : 0;
      targetFrame = Math.round(targetProgress * (CFG.hero.frameCount - 1)) + 1;

      // Lerp smoothing
      currentFrame += (targetFrame - currentFrame) * CFG.hero.lerpFactor;
      currentProgress += (targetProgress - currentProgress) * CFG.hero.lerpFactor;

      const roundedFrame = Math.round(currentFrame);

      // Redraw only when the rounded frame or fade progress changes
      if (roundedFrame !== lastDrawnFrame || Math.abs(currentProgress - lastRenderedProgress) > 0.002) {
        renderCanvas(roundedFrame, currentProgress);
        lastDrawnFrame = roundedFrame;
        lastRenderedProgress = currentProgress;
      }

      // Update bottom progress bar (1px xenon line)
      if (progressBar) {
        progressBar.style.width = `${(targetProgress * 100).toFixed(2)}%`;
      }

      updateChapters(targetProgress);

      requestAnimationFrame(scrollyLoop);
    }

    requestAnimationFrame(scrollyLoop);
  }

  /* ==========================================================================
     6. SECTION 2: STATEMENT SCROLL REVEAL
     Sentence reveals word-by-word with scroll (15% -> 100% opacity).
     ========================================================================== */
  function initStatementReveal() {
    const section = document.getElementById('statement');
    const quote = document.getElementById('statement-quote');
    if (!section || !quote) return;

    const words = quote.querySelectorAll('.word');

    function updateStatement() {
      const rect = section.getBoundingClientRect();
      const windowH = window.innerHeight;
      // Start reveal when section is halfway up the screen, finish when centered
      const start = windowH * 0.85;
      const end = windowH * 0.20;
      const progress = Math.min(Math.max((start - rect.top) / (start - end), 0), 1);

      const totalWords = words.length;
      words.forEach((word, index) => {
        const wordStart = index / totalWords;
        const wordEnd = (index + 1) / totalWords;
        let wordProgress = 0;
        if (progress > wordStart) {
          wordProgress = Math.min((progress - wordStart) / (wordEnd - wordStart), 1);
        }
        const opacity = 0.15 + 0.85 * wordProgress;
        word.style.opacity = opacity;
        word.style.color = wordProgress >= 0.95 ? 'var(--bone)' : 'var(--fog)';
      });
    }

    window.addEventListener('scroll', updateStatement, { passive: true });
    updateStatement();
  }

  /* ==========================================================================
     7. SECTION 3: DISMANTLE PINNED SCROLLYTELLING & VECTOR CALLOUTS
     Scrubbing 240 dismantle frames. After 70% progress, 4 callouts fade in.
     Each callout has a small xenon dot on the car part, connected by a 1px
     hairline to a mono label + body text.
     ========================================================================== */
  function initDismantleScrolly(dismantleSequence) {
    const wrapper = document.getElementById('dismantle');
    const canvas = document.getElementById('dismantle-canvas');
    const calloutsLayer = document.getElementById('dismantle-callouts-layer');
    const progressBar = document.getElementById('dismantle-progress-bar');
    if (!wrapper || !canvas || !calloutsLayer) return;

    const ctx = canvas.getContext('2d');
    let canvasWidth = 0;
    let canvasHeight = 0;
    let dpr = 1;

    let currentFrame = 1;
    let targetFrame = 1;
    let targetProgress = 0;
    let lastDrawnFrame = -1;

    // Track car drawing boundaries for coordinate anchoring
    let carBounds = { x: 0, y: 0, width: 0, height: 0 };

    function resizeCanvas() {
      dpr = Math.min(window.devicePixelRatio || 1, CFG.hardware.maxDevicePixelRatio);
      canvasWidth = window.innerWidth;
      canvasHeight = window.innerHeight;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastDrawnFrame = -1;
      updateCalloutPositions();
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Build callout elements in the DOM
    calloutsLayer.innerHTML = '';
    const calloutElements = CFG.dismantle.callouts.map((c) => {
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
        container: container,
        line: container.querySelector('.callout-line'),
        dot: container.querySelector('.callout-dot'),
        card: container.querySelector('.callout-card')
      };
    });

    function updateCalloutPositions() {
      const stageW = canvasWidth;
      const stageH = canvasHeight;

      calloutElements.forEach((item) => {
        const c = item.config;
        // Anchor dot on the car part using natural car frame coordinates
        const dotX = carBounds.x + (c.dotX / 100) * carBounds.width;
        const dotY = carBounds.y + (c.dotY / 100) * carBounds.height;

        // Label position
        const labelX = (c.labelX / 100) * stageW;
        const labelY = (c.labelY / 100) * stageH;

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

    function renderCanvas(frameNum) {
      ctx.fillStyle = '#07080A';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const img = dismantleSequence.getFrame(frameNum);
      if (img && img.naturalWidth) {
        const isPortrait = canvasHeight > canvasWidth;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        let drawW, drawH, drawX, drawY;

        if (isPortrait) {
          const scale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
          drawW = imgW * scale;
          drawH = imgH * scale;
          drawX = (canvasWidth - drawW) / 2;
          drawY = (canvasHeight - drawH) / 2;
        } else {
          const scale = Math.max(canvasWidth / imgW, canvasHeight / imgH);
          drawW = imgW * scale;
          drawH = imgH * scale;
          drawX = (canvasWidth - drawW) / 2;
          drawY = (canvasHeight - drawH) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        carBounds = { x: drawX, y: drawY, width: drawW, height: drawH };
        updateCalloutPositions();
      }
    }

    function scrollyLoop() {
      const rect = wrapper.getBoundingClientRect();
      const maxScroll = wrapper.offsetHeight - window.innerHeight;
      targetProgress = maxScroll > 0 ? Math.min(Math.max(-rect.top / maxScroll, 0), 1) : 0;
      targetFrame = Math.round(targetProgress * (CFG.dismantle.frameCount - 1)) + 1;

      currentFrame += (targetFrame - currentFrame) * CFG.dismantle.lerpFactor;
      const roundedFrame = Math.round(currentFrame);

      if (roundedFrame !== lastDrawnFrame) {
        renderCanvas(roundedFrame);
        lastDrawnFrame = roundedFrame;
      }

      if (progressBar) {
        progressBar.style.width = `${(targetProgress * 100).toFixed(2)}%`;
      }

      // Reveal callouts sequentially after 70% progress
      calloutElements.forEach((item) => {
        const shouldShow = targetProgress >= item.config.threshold;
        if (shouldShow && !item.container.classList.contains('is-visible')) {
          item.container.classList.add('is-visible');
        } else if (!shouldShow && item.container.classList.contains('is-visible')) {
          item.container.classList.remove('is-visible');
        }
      });

      requestAnimationFrame(scrollyLoop);
    }

    requestAnimationFrame(scrollyLoop);
  }

  /* ==========================================================================
     8. SECTION 4: LINEUP ACCORDION (Desktop Flex-Grow & Mobile Stacks)
     5 slides side by side. GT-E open by default.
     Debounced hover (80ms), keyboard accessibility (arrow keys),
     slide entrance reveal on viewport entry.
     ========================================================================== */
  function initLineupAccordion() {
    const section = document.getElementById('lineup');
    const container = document.getElementById('lineup-accordion');
    const header = section.querySelector('.lineup-top-header');
    if (!section || !container) return;

    // IntersectionObserver for entrance stagger
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          section.classList.add('is-revealed');
          if (header) header.classList.add('is-revealed');
          observer.unobserve(section);
        }
      });
    }, { threshold: 0.15 });
    observer.observe(section);

    container.innerHTML = '';
    const cars = CFG.lineup.cars;

    cars.forEach((car, index) => {
      const isDefaultOpen = index === 0;
      const slide = document.createElement('div');
      slide.className = `lineup-slide ${isDefaultOpen ? 'is-open' : ''}`;
      slide.id = `lineup-slide-${car.id}`;
      slide.setAttribute('role', 'button');
      slide.setAttribute('tabindex', '0');
      slide.setAttribute('aria-expanded', isDefaultOpen ? 'true' : 'false');
      slide.setAttribute('aria-label', `Model ${car.name}`);
      slide.setAttribute('data-cursor-label', isDefaultOpen ? 'CONFIGURE' : 'OPEN');

      slide.innerHTML = `
        <!-- Closed Visual & Labels -->
        <img class="slide-bg-thumb" src="${car.image}" alt="${car.alt}" loading="lazy" />
        <div class="slide-closed-view" aria-hidden="true">
          <span class="closed-num mono-hud">${car.number}</span>
          <span class="closed-name mono-hud">${car.name}</span>
        </div>

        <!-- Open View Details -->
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
                          aria-label="${c.name}" 
                          title="${c.name}"
                          data-color="${c.name}">
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
    let activeIndex = 0;
    let hoverTimeout = null;

    function openSlide(index) {
      if (index === activeIndex && slides[index].classList.contains('is-open')) return;

      slides.forEach((s, i) => {
        if (i === index) {
          s.classList.add('is-open');
          s.setAttribute('aria-expanded', 'true');
          s.setAttribute('data-cursor-label', 'CONFIGURE');
          if (window.__setCursorLabel) window.__setCursorLabel('CONFIGURE');
        } else {
          s.classList.remove('is-open');
          s.setAttribute('aria-expanded', 'false');
          s.setAttribute('data-cursor-label', 'OPEN');
        }
      });
      activeIndex = index;
    }

    // Attach hover with 80ms debounce (desktop) & click/tap
    slides.forEach((slide, index) => {
      // Swatch selection click
      const swatches = slide.querySelectorAll('.color-swatch');
      swatches.forEach((swatch) => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          swatches.forEach(s => s.classList.remove('is-active'));
          swatch.classList.add('is-active');
        });
      });

      slide.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          openSlide(index);
        }, CFG.lineup.debounceHoverMs);
      });

      slide.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
      });

      slide.addEventListener('click', () => {
        clearTimeout(hoverTimeout);
        openSlide(index);
      });

      // Keyboard arrow navigation
      slide.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = (index + 1) % slides.length;
          slides[next].focus();
          openSlide(next);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = (index - 1 + slides.length) % slides.length;
          slides[prev].focus();
          openSlide(prev);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSlide(index);
        }
      });
    });
  }

  /* ==========================================================================
     9. PRELOADER & INITIALIZATION ORCHESTRATOR
     Loads hero frames 1–40, reveals page, then streams rest of hero + dismantle.
     ========================================================================== */
  function initPreloader(heroSequence, dismantleSequence) {
    const preloaderEl = document.getElementById('preloader');
    const barEl = document.getElementById('preloader-bar');
    const counterEl = document.getElementById('preloader-counter');

    let isDismissed = false;

    function updatePreloaderDisplay(pct) {
      const clamped = Math.min(Math.max(pct, 0), 100);
      if (barEl) barEl.style.width = `${clamped}%`;
      if (counterEl) counterEl.textContent = String(Math.round(clamped)).padStart(3, '0');
    }

    heroSequence.onInitialLoadProgress = (loaded, total) => {
      if (isDismissed) return;
      const pct = (loaded / total) * 100;
      updatePreloaderDisplay(pct);
    };

    const dismissPreloader = () => {
      if (isDismissed) return;
      isDismissed = true;

      updatePreloaderDisplay(100);

      // Flash exit highlight on line
      if (barEl) barEl.classList.add('flash-exit');

      setTimeout(() => {
        if (preloaderEl) preloaderEl.classList.add('is-finished');

        // Reveal Hero initial elements
        const ch1 = document.getElementById('hero-ch1');
        if (ch1) {
          ch1.classList.add('is-active');
          ch1.classList.add('is-revealed');
        }

        // Start background streaming in order: rest of hero, then dismantle
        heroSequence.startBackgroundStreaming(CFG.hero.initialPreloadCount + 1);
        setTimeout(() => {
          dismantleSequence.startBackgroundStreaming(1);
        }, 1200);
      }, 350);
    };

    heroSequence.onInitialLoadComplete = dismissPreloader;

    // Hard safety timer: Preloader will never stay stuck for more than 4 seconds
    setTimeout(dismissPreloader, 4000);

    heroSequence.preloadInitial();
  }

  /* ==========================================================================
     10. MAIN APP BOOTSTRAP
     ========================================================================== */
  function initApp() {
    // Setup frame sequence instances
    const heroSequence = new FrameSequence({
      frameCount: CFG.hero.frameCount,
      desktopPath: CFG.hero.desktopPath,
      mobilePath: CFG.hero.mobilePath,
      initialPreloadCount: CFG.hero.initialPreloadCount
    });

    const dismantleSequence = new FrameSequence({
      frameCount: CFG.dismantle.frameCount,
      desktopPath: CFG.dismantle.desktopPath,
      mobilePath: CFG.dismantle.mobilePath,
      initialPreloadCount: 0
    });

    window.addEventListener('resize', () => {
      heroSequence.handleResize();
      dismantleSequence.handleResize();
    }, { passive: true });

    // Initialize Global Systems
    initFilmGrain();
    initCustomCursor();
    initNav();

    // Initialize Interactive Sections
    initHeroScrolly(heroSequence);
    initStatementReveal();
    initDismantleScrolly(dismantleSequence);
    initLineupAccordion();

    // Kickoff Preloader & Asset Pipeline
    initPreloader(heroSequence, dismantleSequence);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
