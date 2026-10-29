/**
 * NOCTIS Configuration & Tuning Parameters
 * All scrollytelling thresholds, section heights, frame sequences,
 * and component coordinates are defined here for easy tuning.
 */

window.NOCTIS_CONFIG = {
  // --- FRAME COUNTS & ASSET PATHS ---
  hero: {
    frameCount: 718,
    desktopPath: (index) => `assets/frames/hero/frame_${String(index).padStart(4, '0')}.webp`,
    mobilePath: (index) => `assets/frames/hero-mobile/frame_${String(index).padStart(4, '0')}.webp`,
    sectionHeight: '600vh',
    initialPreloadCount: 40, // Frames loaded before revealing site
    lerpFactor: 0.15,
    
    // Chapters mapped to normalized scroll progress [0, 1]
    chapters: [
      {
        id: 'hero-ch1',
        start: 0.00,
        end: 0.12,
        hudChapter: '01/04',
        title: 'NOCTIS',
        subtitle: 'The city is asleep.',
        hint: 'SCROLL TO WAKE IT'
      },
      {
        id: 'hero-ch2',
        start: 0.22,
        end: 0.40,
        hudChapter: '02/04',
        headline: "It doesn't need the city's light."
      },
      {
        id: 'hero-ch3',
        start: 0.50,
        end: 0.68,
        hudChapter: '03/04',
        headline: 'It brings its own.'
      },
      {
        id: 'hero-ch4',
        start: 0.80,
        end: 1.00,
        hudChapter: '04/04',
        model: 'GT-E',
        specs: '0–100 KM/H 3.1S · 640 KM RANGE · DUAL MOTOR',
        linkText: 'Discover the GT-E',
        linkHref: '#lineup'
      }
    ],

    // Speed & distance telemetry tied to hero scroll progress
    telemetry: {
      speedMax: 118,      // KM/H at scroll 1.0
      distanceMax: 4.2    // KM at scroll 1.0
    },

    // Canvas fades to pure asphalt over the final 5%
    fadeToBlackStart: 0.95
  },

  dismantle: {
    frameCount: 240,
    desktopPath: (index) => `assets/frames/dismantle/frame_${String(index).padStart(4, '0')}.webp`,
    mobilePath: (index) => `assets/frames/dismantle-mobile/frame_${String(index).padStart(4, '0')}.webp`,
    sectionHeight: '350vh',
    lerpFactor: 0.15,
    calloutsStart: 0.70,

    // Callout coordinates (% relative to image natural canvas area)
    // dot: anchor on the vehicle component; label: placement of text & hairline line end
    callouts: [
      {
        id: 'body',
        label: 'BODY',
        text: 'Carbon composite monocoque',
        dotX: 53, // percentage of image width
        dotY: 19, // percentage of image height
        labelX: 74,
        labelY: 14,
        threshold: 0.70
      },
      {
        id: 'battery',
        label: 'BATTERY',
        text: '110 kWh structural pack',
        dotX: 56,
        dotY: 67,
        labelX: 78,
        labelY: 74,
        threshold: 0.77
      },
      {
        id: 'drive',
        label: 'DRIVE',
        text: 'Dual axial-flux motors, 680 kW',
        dotX: 36,
        dotY: 69,
        labelX: 14,
        labelY: 82,
        threshold: 0.84
      },
      {
        id: 'light',
        label: 'LIGHT',
        text: 'Single-line LED signature',
        dotX: 18,
        dotY: 57,
        labelX: 10,
        labelY: 42,
        threshold: 0.91
      }
    ]
  },

  // --- LINEUP ACCORDION CONFIGURATION ---
  lineup: {
    debounceHoverMs: 80,
    cars: [
      {
        id: 'gt-e',
        number: '01',
        name: 'GT-E',
        tagline: 'The grand tourer.',
        specs: [
          { label: 'RANGE', value: '640 km' },
          { label: '0–100 KM/H', value: '3.1 s' },
          { label: 'POWER', value: '680 kW' }
        ],
        image: 'assets/cars/gt-e.webp',
        alt: 'NOCTIS GT-E matte graphite electric grand tourer coupe',
        colors: [
          { name: 'Matte Graphite', hex: '#1C1E23' },
          { name: 'Obsidian Black', hex: '#0A0B0D' },
          { name: 'Xenon Silver', hex: '#8F98A5' },
          { name: 'Stealth Carbon', hex: '#121417' }
        ]
      },
      {
        id: 's',
        number: '02',
        name: 'S',
        tagline: 'Four doors, no compromise.',
        specs: [
          { label: 'RANGE', value: '600 km' },
          { label: '0–100 KM/H', value: '3.6 s' },
          { label: 'POWER', value: '520 kW' }
        ],
        image: 'assets/cars/s.webp',
        alt: 'NOCTIS S satin bone white electric sport sedan',
        colors: [
          { name: 'Satin Bone White', hex: '#EDEAE4' },
          { name: 'Graphite Night', hex: '#121418' },
          { name: 'Lunar Grey', hex: '#585D66' },
          { name: 'Deep Midnight', hex: '#0B101D' }
        ]
      },
      {
        id: 'x',
        number: '03',
        name: 'X',
        tagline: 'Higher, never heavier.',
        specs: [
          { label: 'RANGE', value: '560 km' },
          { label: '0–100 KM/H', value: '4.2 s' },
          { label: 'POWER', value: '480 kW' }
        ],
        image: 'assets/cars/x.webp',
        alt: 'NOCTIS X midnight blue electric luxury SUV coupe',
        colors: [
          { name: 'Midnight Blue', hex: '#0E172B' },
          { name: 'Asphalt Black', hex: '#07080A' },
          { name: 'Cold Slate', hex: '#313742' },
          { name: 'Bone White', hex: '#EDEAE4' }
        ]
      },
      {
        id: 'r',
        number: '04',
        name: 'R',
        tagline: 'Built for the track.',
        specs: [
          { label: 'RANGE', value: '420 km' },
          { label: '0–100 KM/H', value: '2.4 s' },
          { label: 'POWER', value: '900 kW' }
        ],
        image: 'assets/cars/r.webp',
        alt: 'NOCTIS R satin stealth black electric track coupe with fixed rear wing',
        colors: [
          { name: 'Satin Carbon', hex: '#0B0C0E' },
          { name: 'Taillight Red Trim', hex: '#E1251B' },
          { name: 'Graphite Matte', hex: '#1E2127' },
          { name: 'Raw Weave', hex: '#14161B' }
        ]
      },
      {
        id: 'one',
        number: '05',
        name: 'ONE',
        tagline: 'The future, early.',
        specs: [
          { label: 'RANGE', value: 'Concept' },
          { label: '0–100 KM/H', value: '1.9 s' },
          { label: 'POWER', value: '1,100 kW' }
        ],
        image: 'assets/cars/one.webp',
        alt: 'NOCTIS ONE liquid silver aerodynamic electric hypercar concept',
        colors: [
          { name: 'Liquid Silver', hex: '#B8BDC6' },
          { name: 'Void Black', hex: '#050608' },
          { name: 'Hyper Titanium', hex: '#4D5460' },
          { name: 'Pure Xenon', hex: '#CFE3FF' }
        ]
      }
    ]
  },

  // --- HARDWARE & DEVICE SETTINGS ---
  hardware: {
    mobileBreakpoint: 768,
    cursorLerp: 0.18,
    maxDevicePixelRatio: 2.0,
    noiseTileSize: 128,
    noiseFps: 8,
    noiseOpacity: 0.035
  }
};
