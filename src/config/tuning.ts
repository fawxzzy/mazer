export const legacyTuning = {
  board: {
    // Legacy C++ truth (`MazerGameModeBase::SetupGrid`): default `_Scale` when unset.
    scale: 50,
    // Legacy C++ truth (`MazerGameModeBase`): checkpoint scalar used in count formula.
    checkPointModifier: 0.35,
    // Rebuild lane balance kept from current gameplay pass.
    shortcutCountModifier: {
      menu: 0.13,
      game: 0.18
    },
    frame: {
      shadowOffsetY: 8,
      shadowExpandPx: 24,
      shadowAlpha: 0.32,
      outerExpandPx: 18,
      outerAlpha: 0.76,
      outerStrokeWidth: 2,
      innerStrokeWidth: 2,
      panelAlpha: 0.66,
      glowExpandPx: 30,
      glowAlpha: 0.06,
      wellInsetPx: 8,
      wellAlpha: 0.08,
      edgeShadeWidthPx: 8,
      edgeShadeAlpha: 0.06,
      cornerTickInsetPx: 10,
      cornerTickLengthPx: 18,
      cornerTickAlpha: 0.14,
      topHighlightInsetPx: 8,
      topHighlightHeightPx: 2,
      topHighlightAlpha: 0.1
    },
    tile: {
      floorInsetRatio: 0.1,
      floorInsetAlpha: 0.92,
      floorSheenAlpha: 0.14,
      wallAlpha: 1,
      floorGridAlpha: 0.05,
      bevelRatio: 0.08,
      floorHighlightAlpha: 0.22,
      floorShadowAlpha: 0.16
    },
    goalPulse: {
      basePulse: 0.98,
      waveAmplitude: 0.24,
      waveSpeed: 0.0054,
      glowAlpha: 0.68,
      ringAlpha: 1,
      outerRingAlpha: 0.74,
      glowRadiusRatio: 0.68,
      ringRadiusRatio: 0.35,
      outerRingRadiusRatio: 0.62,
      coreRadiusRatio: 0.18,
      ringWidthRatio: 0.085,
      outerRingWidthRatio: 0.036,
      sparkLengthRatio: 0.3,
      sparkAlpha: 0.74,
      coreHighlightRadiusRatio: 0.082,
      tileHaloAlpha: 0.4,
      beaconRadiusRatio: 0.88,
      beaconAlpha: 0.24,
      reticleInsetRatio: 0.1
    },
    trail: {
      minAlpha: 0.24,
      maxAlpha: 0.9,
      minLineAlpha: 0.38,
      maxLineAlpha: 0.98,
      insetRatio: 0.31,
      lineWidthRatio: 0.12,
      glowLineWidthRatio: 0.2,
      glowMinAlpha: 0.12,
      glowMaxAlpha: 0.24,
      nodeRadiusRatio: 0.074,
      headAlphaBoost: 0.16,
      headRadiusRatio: 0.138,
      headPulseAmplitude: 0.08,
      backtrackAlphaScale: 0.48,
      backtrackLineAlphaScale: 0.58,
      backtrackInsetRatio: 0.41,
      backtrackNodeRadiusRatio: 0.084,
      backtrackOutlineAlpha: 0.9,
      backtrackGlowAlpha: 0.16,
      backtrackLineWidthRatio: 0.084,
      backtrackGlowLineWidthRatio: 0.15,
      targetBracketInsetRatio: 0.14,
      targetBracketLengthRatio: 0.18,
      targetBracketAlpha: 0.82,
      targetTileAlpha: 0.16
    },
    actor: {
      shadowAlpha: 0.76,
      shadowRadiusRatio: 0.4,
      shadowOffsetYRatio: 0.05,
      emphasisFloorAlpha: 0.34,
      emphasisFloorRadiusRatio: 0.74,
      haloAlpha: 0.46,
      haloMinimumAlpha: 0.42,
      haloRadiusRatio: 0.5,
      coreRadiusRatio: 0.38,
      ringRadiusRatio: 0.4,
      ringWidthRatio: 0.11,
      focusRingAlpha: 0.92,
      focusRingRadiusRatio: 0.62,
      focusRingWidthRatio: 0.058,
      outerRingRadiusRatio: 0.56,
      outerRingAlpha: 0.54,
      outerRingMinimumAlpha: 0.72,
      highlightOffsetRatio: 0.072,
      highlightRadiusRatio: 0.112,
      silhouetteRadiusRatio: 0.5,
      silhouetteStrokeWidthRatio: 0.12,
      minimumVisibleRadiusRatio: 0.3,
      pointerOffsetRatio: 0.25,
      pointerLengthRatio: 0.38,
      pointerBaseWidthRatio: 0.13,
      pointerRadiusRatio: 0.065,
      pointerWidthRatio: 0.074,
      pulseAmplitude: 0.13,
      pulseSpeed: 0.0061,
      backtrackHaloAlpha: 0.28,
      deadEndRingAlpha: 0.84,
      reacquireRingAlpha: 0.98,
      anticipationNudgeRatio: 0.09,
      reacquireNudgeRatio: 0.05,
      goalHaloAlpha: 0.74
    },
    telegraph: {
      tileInsetRatio: 0.18,
      laneWidthRatio: 0.1,
      gateBarWidthRatio: 0.12,
      ringWidthRatio: 0.052,
      pulseAlphaMin: 0.26,
      pulseAlphaMax: 0.84,
      readinessAlphaScale: 0.78,
      connectorOffsetRatio: 0.16,
      keyRadiusRatio: 0.16
    }
  },
  menu: {
    layout: {
      narrowBreakpoint: 620,
      smallMazeMaxSpanTiles: 25,
      mediumMazeMaxSpanTiles: 39,
      smallMazeMaxSafeOccupancyWide: 0.74,
      smallMazeMaxSafeOccupancyCompact: 0.82,
      mediumMazeMaxSafeOccupancyWide: 0.88,
      mediumMazeMaxSafeOccupancyCompact: 0.92,
      smallMazeMaxTilePxWide: 18,
      smallMazeMaxTilePxCompact: 14
    },
    intentFeed: {
      insetXPx: 18,
      insetYPx: 20,
      widthPx: 472,
      compactWidthPx: 348,
      minWidthPx: 252,
      compactMinWidthPx: 220,
      maxWidthRatio: 0.34,
      compactMaxWidthRatio: 0.82,
      maxVisibleEntries: 5,
      portraitVisibleEntries: 3,
      landscapeVisibleEntries: 4,
      expandedVisibleEntries: 5,
      compactLandscapeVisibleEntriesMinWidthPx: 700,
      compactLandscapeVisibleEntriesMinHeightPx: 420,
      expandedVisibleEntriesMinWidthPx: 960,
      expandedVisibleEntriesMinHeightPx: 700,
      minHeightPx: 72,
      compactMinHeightPx: 64,
      paddingXPx: 20,
      paddingYPx: 10,
      compactPaddingYPx: 8,
      lineHeightPx: 24,
      compactLineHeightPx: 20,
      entryGapPx: 4,
      compactEntryGapPx: 2,
      statusFontPx: 16,
      compactStatusFontPx: 14,
      entryFontPx: 15,
      compactEntryFontPx: 13,
      summaryMaxChars: 40,
      compactSummaryMaxChars: 30,
      statusMaxChars: 40,
      compactStatusMaxChars: 30,
      holdDurationMs: 2600,
      minimumDwellMs: 2200,
      replacementDebounceMs: 1040,
      fadeDurationMs: 540,
      transitionMs: 440,
      transitionStartAlpha: 0.52,
      replacementOverlapMs: 180,
      slideOffsetLines: 0.56,
      upwardDriftPx: 10,
      compactUpwardDriftPx: 8,
      lineAlphaScales: [1, 0.72, 0.5, 0.32, 0.18],
      occlusionPadPx: 36,
      boardGapPx: 12,
      installGapPx: 12,
      commentaryRailEnabled: false,
      commentaryRailMinViewportWidthPx: 960,
      commentaryRailMinViewportHeightPx: 620,
      commentaryRailMinAspectRatio: 1.2,
      desktopBottomWidthPx: 780,
      desktopBottomMinWidthPx: 500,
      desktopBottomMaxWidthRatio: 0.6
    },
    runtime: {
      diagnosticsPublishIntervalMs: 1500,
      recentFrameWindow: 180,
      heapSampleWindow: 45,
      degradeAverageFrameMs: 19,
      recoverAverageFrameMs: 16.5,
      degradeSpikeCount: 4,
      recoverSpikeCount: 1,
      heapGrowthThrottleBytes: 1250000,
      heapGrowthRecoverBytes: 600000,
      postHiddenRecoveryMs: 2200,
      spikeFrameMs: 50,
      lowPowerHardwareConcurrencyMax: 4,
      // full was 83ms (~12fps) -- a deliberate battery-saving throttle, but
      // far too coarse for the starfield's fast/near "warp streak" stars and
      // the continuously-time-driven glass shard/drift rune motion, both of
      // which sample raw current time on every actual redraw: at 12fps that
      // reads as visibly choppy/glitchy rather than smooth drift. update()
      // already drives this at the real per-frame rate regardless -- this
      // was purely an extra throttle on top, so lowering it to match a
      // real frame is a straight smoothness win, not new per-frame cost.
      // throttled/hidden are real performance-degradation fallbacks. throttled used to be 250 ms (4 updates a
      // second), which on a phone that counts as low power (4 or fewer cores, or Save-Data) made every star hop
      // four times a second instead of drifting; 100 ms (10 a second) keeps most of the saving and reads as motion.
      ambientUpdateIntervalMs: {
        full: 16,
        throttled: 100,
        hidden: 1000
      },
      deferredTasksPerFrame: {
        full: 2,
        throttled: 1,
        hidden: 0
      }
    }
  },
  demo: {
    seed: 1988,
    cadence: {
      // Legacy AI was timer-driven (`_PlayerAiDelayDuration`); exact value was BP-driven.
      spawnHoldMs: 360,
      exploreStepMs: 138,
      backtrackStepMs: 138,
      decisionPauseMs: 138,
      anticipationStepMs: 138,
      branchCommitMs: 138,
      branchResumeMs: 138,
      // Ambient shell should linger at the solved end-state long enough to read the full route.
      goalHoldMs: 3900,
      resetHoldMs: 620
    },
    lifecycle: {
      exitArrivalInsetRatio: 0.18,
      reducedMotionChunkSize: 5
    },
    behavior: {
      trailMaxLength: 46,
      aiTilePathAdditionalPaths: 0,
      preserveVisitedOnAiReset: true,
      emulateLogicSwitchPotentialCheckBug: true,
      regenerateSeedStep: 1,
      prerollSteps: 24
    }
  },
  colors: {
    background: {
      deepSpace: 0x130d23,
      nebula: 0x31184f,
      nebulaCore: 0x56357d,
      vignette: 0x090510,
      star: 0xf5efff,
      cloud: 0x5a348b
    },
    frame: {
      shadow: 0x02040a,
      outer: 0x0d1118,
      outerStroke: 0x32445c,
      innerStroke: 0x7ca5d0,
      topHighlight: 0xd8ecff,
      panel: 0x16161d,
      panelStroke: 0x30374a,
      glow: 0x7287d8,
      well: 0x090c12
    },
    wall: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.067708, g: 0.067708, b: 0.067708 }
    },
    path: {
      // Direct legacy defaults from `MazerGameInstance.h` originals.
      linearRgb: { r: 0.19099, g: 0.192708, b: 0.18769 }
    },
    player: 0x79d7ff,
    playerCore: 0xf6fbff,
    playerHalo: 0xa4e4ff,
    playerShadow: 0x05070f,
    trail: 0x42b4ff,
    trailCore: 0xb7f0ff,
    trailGlow: 0x15598b,
    goal: 0xff6274,
    goalCore: 0xffe6ea,
    floor: 0xc8c8c8,
    hud: {
      panel: 0x07101a,
      panelStroke: 0x6e9bd6,
      accent: 0x7bc1ff,
      shadow: 0x01050c,
      timerText: 0xc8ffd0,
      goalText: 0xffa3ab,
      hintText: 0xb8c4d8
    }
  }
} as const;

export const toHex = (r: number, g: number, b: number): number => {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
};
