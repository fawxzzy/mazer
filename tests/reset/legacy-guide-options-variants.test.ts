import { describe, expect, it } from 'vitest';
import { LEGACY_GUIDE_ROWS } from '../../src/legacy-runtime/legacyGuideContent';
import {
  GUIDE_OPTIONS_COPY_CAP,
  GUIDE_OPTIONS_GLOSSARY_ORDER,
  GUIDE_OPTIONS_GROUPS,
  GUIDE_OPTIONS_ROWS,
  resolveGuideOptionsVariant
} from '../../src/legacy-runtime/legacyGuideOptionsVariants';

describe('Guide redesign options (data)', () => {
  const allIds = Object.keys(GUIDE_OPTIONS_ROWS).sort();

  it('every shipped row plus the new menu-play row, nothing else', () => {
    expect(allIds).toEqual([...LEGACY_GUIDE_ROWS.map((row) => row.id), 'menu-play'].sort());
  });

  it('keeps copy within the player-message cap', () => {
    for (const row of Object.values(GUIDE_OPTIONS_ROWS)) {
      expect(row.text.length, row.id).toBeLessThanOrEqual(GUIDE_OPTIONS_COPY_CAP);
    }
  });

  it('A/B groups and C tiles each cover every row exactly once', () => {
    expect(GUIDE_OPTIONS_GROUPS.flatMap((group) => [...group.rows]).sort()).toEqual(allIds);
    expect([...GUIDE_OPTIONS_GLOSSARY_ORDER].sort()).toEqual(allIds);
  });

  it('the menu pair names every dropdown row (main and play)', () => {
    const text = `${GUIDE_OPTIONS_ROWS.menu.text} ${GUIDE_OPTIONS_ROWS['menu-play'].text}`;
    for (const label of ['Settings', 'Guide', 'Sound', 'Profile', 'Leaderboard', 'Reset level', 'Main menu']) {
      expect(text).toContain(label);
    }
  });

  it('the flag is read only from guideOptions', () => {
    expect(resolveGuideOptionsVariant('')).toBeNull();
    expect(resolveGuideOptionsVariant('?guideOptions=b')).toBe('B');
    expect(resolveGuideOptionsVariant('?guideOptions=zzz')).toBe('A');
  });
});
