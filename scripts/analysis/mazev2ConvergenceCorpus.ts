// Wave 1.5 PR D -- the convergence recipe corpus for the generator-convergence
// harness (mazev2-convergence.ts), replacing PR B's own 6-recipe corpus.
//
// Honesty note, read before trusting any recipe as more independently
// controlled than it is: neither engine has a real recipe resolver yet
// (MazeV2TargetRecipe -> MazeV2ResolvedGenerationContract's per-axis
// absolute targets are explicitly unbuilt -- see types.ts's own
// MazeV2RecipeResolutionTargets comment). The only genuinely independent,
// engine-observable inputs both adapters currently accept are width,
// height, targetComplexity (0-100), lane, and requireWrap. Every recipe
// below is expressed through those five inputs -- there is no direct
// control over turning, branch density, dead-end depth, loop density,
// shortcut density, or endpoint placement for either engine today (neither
// exposes a placement-strategy input, confirmed by inspecting both
// engines' public build options). Recipe NAMES and REASONS below name the
// axis Wave 1.5's own brief asked this corpus to stress; the actual dial
// turned to approximate that intent is always one of the five real inputs,
// and each recipe's own `note` field says so explicitly rather than
// implying a control that doesn't exist. This is a real, if coarse,
// exploration of the input space both engines actually expose -- not a
// simulation of per-axis targets neither engine can accept yet.
export interface MazeV2ConvergenceRecipe {
  name: string;
  reason: string;
  note: string;
  width: number;
  height: number;
  targetComplexity: number;
  requireWrap?: boolean;
  // A requested axis neither engine can currently control remains in the
  // corpus as one explicit unsupported observation, never as one or more
  // duplicate executable recipes that imply a comparison occurred.
  unsupportedReason?: string;
}

export const MAZE_V2_CONVERGENCE_CORPUS: readonly MazeV2ConvergenceRecipe[] = [
  {
    name: 'baseline-small',
    reason: 'A small, low-complexity reference point every other recipe can be compared against.',
    note: 'Square board, low targetComplexity.',
    width: 20,
    height: 20,
    targetComplexity: 20
  },
  {
    name: 'long-mostly-straight-route',
    reason: 'Stresses long, low-turn corridors.',
    note: 'No direct "straightness" input exists for either engine through this harness (legacy-runtime\'s own straightnessBias and domain/maze\'s anti-straightness phase are both real capabilities -- see each adapter\'s capability matrix -- but neither is exposed as a per-sample dial here yet). Proxy: an elongated 60x20 board at low complexity, which empirically tends to produce longer, less convoluted routes.',
    width: 60,
    height: 20,
    targetComplexity: 15
  },
  {
    name: 'high-turning-density',
    reason: 'Stresses frequent direction changes.',
    note: 'Same straightness-control gap as above. Proxy: a square board at high targetComplexity, which PR B\'s own measured data showed correlates with higher turn ratios for both engines.',
    width: 20,
    height: 20,
    targetComplexity: 90
  },
  {
    name: 'low-branch-density',
    reason: 'Stresses sparse decision points.',
    note: 'Proxy: low targetComplexity on a square board.',
    width: 20,
    height: 20,
    targetComplexity: 10
  },
  {
    name: 'high-branch-density',
    reason: 'Stresses frequent decision points.',
    note: 'Proxy: near-maximum targetComplexity on a square board.',
    width: 20,
    height: 20,
    targetComplexity: 95
  },
  {
    name: 'many-shallow-dead-ends',
    reason: 'Stresses a high count of short, easily-abandoned dead ends.',
    note: 'No direct dead-end-depth input exists for either engine. Proxy: a mid-size board at moderately-high complexity.',
    width: 30,
    height: 30,
    targetComplexity: 60
  },
  {
    name: 'few-deep-deceptive-dead-ends',
    reason: 'Stresses a small number of long, misleading dead ends.',
    note: 'Same dead-end-depth control gap as above. Proxy: a larger board at moderate complexity.',
    width: 40,
    height: 40,
    targetComplexity: 40
  },
  {
    name: 'low-loop-tree-like-topology',
    reason: 'Stresses a near-perfect-maze (tree) topology with minimal cycles.',
    note: 'Proxy: low targetComplexity, which for both engines\' current heuristics correlates with fewer shortcuts/loops (see each adapter\'s shortcutRelief mapping).',
    width: 25,
    height: 25,
    targetComplexity: 15
  },
  {
    name: 'high-meaningful-loop-topology',
    reason: 'Stresses a topology with many real alternate routes (high cycle rank).',
    note: 'Proxy: high targetComplexity on the same board size as the low-loop recipe above, for a direct paired comparison.',
    width: 25,
    height: 25,
    targetComplexity: 85
  },
  {
    name: 'high-shortcut-relief-bounded-ambiguity',
    reason: 'Stresses shortcut density without unbounded route ambiguity.',
    note: 'Both engines have a real, native shortcut concept (legacy-runtime: shortcutCountMultiplier; domain/maze: shortcutCountModifier/shortcutsCreated -- PR D correction to the capability matrix). Proxy: mid-high targetComplexity, which both engines\' heuristics map toward higher shortcut density.',
    width: 25,
    height: 25,
    targetComplexity: 70
  },
  {
    name: 'endpoint-placement-unsupported',
    reason: 'Records that endpoint placement cannot yet be controlled for either engine.',
    note: 'Neither engine exposes a placement-strategy input through its public build options. This single explicitly unsupported entry replaces two duplicate executable recipes that differed only by name and therefore could not measure distant-corner versus noncorner-offaxis behavior.',
    width: 30,
    height: 30,
    targetComplexity: 30,
    unsupportedReason: 'Neither engine exposes a controllable endpoint-placement input; no maze is generated for this recipe.'
  },
  {
    name: 'wide-rectangular-footprint',
    reason: 'Stresses non-square board geometry (wide).',
    note: 'A genuinely controllable recipe -- width/height are real, independent inputs for both engines (with the realized-dimension caveats each adapter\'s spatialLoad capability note documents).',
    width: 60,
    height: 20,
    targetComplexity: 40
  },
  {
    name: 'tall-rectangular-footprint',
    reason: 'Stresses non-square board geometry (tall).',
    note: 'Genuinely controllable, same as wide-rectangular-footprint, transposed.',
    width: 20,
    height: 60,
    targetComplexity: 40
  },
  {
    name: 'explicit-wrap-bleed-demand',
    reason: 'Stresses wrap/bleed edge topology directly, not left to chance.',
    note: 'requireWrap: true forces legacy-runtime\'s own requiredOppositeBorderConnections profile flag on both axes (a genuine, independent, engine-native control -- see legacyRuntimeAdapter.ts). src/domain/maze has no wrap concept at all (wrapPressure: \'unsupported\' in its own capability matrix), so that adapter rejects the sample during support preflight before generation or timing instead of fabricating a wrap-free result.',
    width: 25,
    height: 25,
    targetComplexity: 50,
    requireWrap: true
  }
];
