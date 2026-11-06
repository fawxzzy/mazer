import { describe, expect, test } from 'vitest';
import {
  buildLegacyRunStatusViewModel,
  normalizeLegacyRunStatusMazeLevel,
  normalizeLegacyRunStatusRank,
  normalizeLegacyRunStatusScore,
  resolveLegacyRunStatusViewModelLayout,
  type LegacyRunStatusInput
} from '../../src/legacy-runtime/legacyRunStatusViewModel';
import { resolveLegacyRunStatusPanelLayout } from '../../src/legacy-runtime/legacyUiStandards';

const texts = (input: LegacyRunStatusInput) => {
  const model = buildLegacyRunStatusViewModel(input);
  return [model.rankRow.text, model.detailRow.text];
};

describe('legacy run-status view-model', () => {
  test('is deterministic for identical input', () => {
    const input = { rank: 'B', mazeLevel: 12, score: 73.4 };
    expect(buildLegacyRunStatusViewModel(input)).toEqual(buildLegacyRunStatusViewModel({ ...input }));
    expect(JSON.stringify(buildLegacyRunStatusViewModel(input))).toBe(
      JSON.stringify(buildLegacyRunStatusViewModel(input))
    );
  });

  test('shows the Score: --/100 placeholder until a canonical score exists', () => {
    for (const score of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '', 'abc']) {
      expect(texts({ rank: 'C', mazeLevel: 4, score })[1]).toBe('Maze Lvl 4 | Score: --/100');
    }
    expect(buildLegacyRunStatusViewModel({ rank: 'C', mazeLevel: 4 }).values.score).toBeNull();
    expect(texts({ rank: 'C', mazeLevel: 4, score: 88 })[1]).toBe('Maze Lvl 4 | Score: 88/100');
  });

  test('rounds half up and clamps the canonical score into 0-100', () => {
    expect(normalizeLegacyRunStatusScore(72.4)).toBe(72);
    expect(normalizeLegacyRunStatusScore(72.5)).toBe(73);
    expect(normalizeLegacyRunStatusScore(0)).toBe(0);
    expect(Object.is(normalizeLegacyRunStatusScore(-0.4), 0)).toBe(true);
    expect(normalizeLegacyRunStatusScore(-12)).toBe(0);
    expect(normalizeLegacyRunStatusScore(100.4)).toBe(100);
    expect(normalizeLegacyRunStatusScore(250)).toBe(100);
    expect(texts({ rank: 'A', mazeLevel: 1, score: 250 })[1]).toBe('Maze Lvl 1 | Score: 100/100');
    expect(texts({ rank: 'A', mazeLevel: 1, score: -5 })[1]).toBe('Maze Lvl 1 | Score: 0/100');
  });

  test('handles missing, invalid and out-of-range rank and level', () => {
    expect(texts({})).toEqual(['Rank: --', 'Maze Lvl -- | Score: --/100']);
    expect(texts(undefined as never)).toEqual(['Rank: --', 'Maze Lvl -- | Score: --/100']);
    expect(normalizeLegacyRunStatusRank(' s ')).toBe('S');
    expect(normalizeLegacyRunStatusRank('Z')).toBeNull();
    expect(normalizeLegacyRunStatusRank(3)).toBeNull();
    expect(normalizeLegacyRunStatusMazeLevel(Number.NaN)).toBeNull();
    expect(normalizeLegacyRunStatusMazeLevel(-3)).toBe('1');
    expect(normalizeLegacyRunStatusMazeLevel(0)).toBe('1');
    expect(normalizeLegacyRunStatusMazeLevel(7.9)).toBe('7');
    expect(normalizeLegacyRunStatusMazeLevel(1e300)).toBeNull();
    expect(normalizeLegacyRunStatusMazeLevel('0042')).toBe('42');
    expect(normalizeLegacyRunStatusMazeLevel('4x')).toBeNull();
    expect(normalizeLegacyRunStatusMazeLevel({})).toBeNull();
  });

  test('keeps levels above the safe-integer range lossless', () => {
    const huge = '9007199254740993123';
    expect(normalizeLegacyRunStatusMazeLevel(huge)).toBe(huge);
    expect(normalizeLegacyRunStatusMazeLevel(BigInt(huge))).toBe(huge);
    expect(texts({ rank: 'S', mazeLevel: huge })[1]).toBe(`Maze Lvl ${huge} | Score: --/100`);
  });

  test('menu and play produce identical output', () => {
    for (const base of [
      { rank: 'E', mazeLevel: 1 },
      { rank: 'S', mazeLevel: 99, score: 100 },
      { rank: 'nope', mazeLevel: Number.NaN, score: Number.NaN }
    ]) {
      expect(buildLegacyRunStatusViewModel({ ...base, mode: 'menu' })).toEqual(
        buildLegacyRunStatusViewModel({ ...base, mode: 'play' })
      );
      expect(buildLegacyRunStatusViewModel({ ...base, mode: 'menu' })).toEqual(buildLegacyRunStatusViewModel(base));
    }
  });

  test('never uses Skill wording in any public string', () => {
    const inputs = [
      {},
      { rank: 'A', mazeLevel: 5, score: 61 },
      { rank: 'zz', mazeLevel: -1, score: Number.NaN }
    ];
    for (const input of inputs) {
      const model = buildLegacyRunStatusViewModel(input);
      const everything = [
        model.accessibilityLabel,
        ...model.rows.flatMap((row) => [row.text, row.accessibilityLabel, ...row.segments])
      ].join('\n');
      expect(everything).not.toMatch(/skill/i);
    }
    expect(buildLegacyRunStatusViewModel({ rank: 'A' }).rankRow.text).toBe('Rank: A');
  });

  test('snapshots the stable strings', () => {
    const model = buildLegacyRunStatusViewModel({ rank: 'B', mazeLevel: 12, score: 73.5 });
    expect({
      accessibilityLabel: model.accessibilityLabel,
      rows: model.rows.map((row) => ({
        accessibilityLabel: row.accessibilityLabel,
        segments: row.segments,
        text: row.text
      })),
      values: model.values
    }).toMatchInlineSnapshot(`
      {
        "accessibilityLabel": "Rank B. Maze level 12, Run score 74 out of 100",
        "rows": [
          {
            "accessibilityLabel": "Rank B",
            "segments": [
              "Rank: B",
            ],
            "text": "Rank: B",
          },
          {
            "accessibilityLabel": "Maze level 12, Run score 74 out of 100",
            "segments": [
              "Maze Lvl 12",
              "Score: 74/100",
            ],
            "text": "Maze Lvl 12 | Score: 74/100",
          },
        ],
        "values": {
          "mazeLevel": "12",
          "rank": "B",
          "score": 74,
        },
      }
    `);
    expect(buildLegacyRunStatusViewModel({ rank: 'E', mazeLevel: 1 }).accessibilityLabel).toBe(
      'Rank E. Maze level 1, Run score not available yet'
    );
  });

  test('layout hook reuses the shared panel layout unchanged', () => {
    for (const [viewport, available] of [[390, undefined], [390, 208], [900, undefined]] as const) {
      const hook = resolveLegacyRunStatusViewModelLayout(viewport, available);
      expect(hook.panel).toEqual(resolveLegacyRunStatusPanelLayout(viewport, available ?? viewport));
    }
    // 260 wide, 18 padding each side, 0.96 safety => floor(224 * 0.96)
    expect(resolveLegacyRunStatusViewModelLayout(390).maxTextWidth).toBe(215);
    expect(resolveLegacyRunStatusViewModelLayout(900).maxTextWidth).toBe(Math.floor((292 - 44) * 0.96));
  });
});
