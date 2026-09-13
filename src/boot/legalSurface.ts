import { buildMazerLegalUrl, type MazerLegalRoute } from '../legacy-runtime/legacyAccountPortal';

export const MAZER_LEGAL_SURFACE_ID = 'mazer-legal-surface';

interface LegalDocumentLike {
  body: Pick<HTMLElement, 'append' | 'classList' | 'replaceChildren'>;
  createElement: Document['createElement'];
}

const LEGAL_COPY: Record<MazerLegalRoute, { body: string; title: string }> = {
  privacy: {
    body: 'Mazer uses your shared Fawxzzy account to keep progression, settings, and leaderboard identity connected. The canonical policy explains what is stored, why it is used, and your choices.',
    title: 'Mazer Privacy'
  },
  terms: {
    body: 'Mazer is provided under the shared Fawxzzy terms, including account, gameplay, availability, and acceptable-use rules. The canonical terms are the authoritative version.',
    title: 'Mazer Terms'
  }
};

export const installMazerLegalSurface = (
  documentRef: LegalDocumentLike,
  route: MazerLegalRoute
): HTMLElement => {
  const copy = LEGAL_COPY[route];
  const surface = documentRef.createElement('main');
  surface.id = MAZER_LEGAL_SURFACE_ID;
  surface.className = 'mazer-legal-surface';

  const card = documentRef.createElement('article');
  card.className = 'mazer-legal-card';
  const brand = documentRef.createElement('strong');
  brand.className = 'mazer-legal-brand';
  brand.textContent = 'MAZER';
  const title = documentRef.createElement('h1');
  title.textContent = copy.title;
  const body = documentRef.createElement('p');
  body.textContent = copy.body;
  const canonical = documentRef.createElement('a');
  canonical.href = buildMazerLegalUrl(route);
  canonical.rel = 'external nofollow noopener noreferrer';
  canonical.textContent = `Read the complete ${route === 'privacy' ? 'privacy policy' : 'terms'}`;
  const back = documentRef.createElement('a');
  back.href = '/';
  back.textContent = 'Back to Mazer';

  card.append(brand, title, body, canonical, back);
  surface.append(card);
  documentRef.body.replaceChildren(surface);
  documentRef.body.classList.add('mazer-legal-page');
  return surface;
};
