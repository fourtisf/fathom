/**
 * Noxsea mark: "Sealed Drop" (a drop of sea water with a keyhole), midnight tile.
 * Single source for the header/footer logo, OG image and Apple icon; app/icon.svg mirrors it.
 */
const DROP =
  'M32 8.5S14.5 27.2 14.5 39.2C14.5 48.6 22.3 56 32 56s17.5-7.4 17.5-16.8C49.5 27.2 32 8.5 32 8.5z' +
  'M29.4 40.03A4.8 4.8 0 1 1 34.6 40.03L36.1 47.5H27.9Z';

const DEFS = `
  <linearGradient id="nx-bg" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#1A2058"/><stop offset="1" stop-color="#070A22"/></linearGradient>
  <linearGradient id="nx-st" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#8B7CFF" stop-opacity=".45"/></linearGradient>
  <linearGradient id="nx-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#A89BFF"/><stop offset=".5" stop-color="#6B78FF"/><stop offset="1" stop-color="#4FD6EC"/></linearGradient>`;

/** Rounded midnight tile with hairline border (UI logo, favicon). */
export const LOGO_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS}</defs><rect x=".5" y=".5" width="63" height="63" rx="16.5" fill="url(#nx-bg)" stroke="url(#nx-st)"/><path fill="url(#nx-g)" fill-rule="evenodd" d="${DROP}"/></svg>`;

/** Full-bleed square (platforms that round the corners themselves, e.g. iOS). */
export const LOGO_SVG_SQUARE = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS}</defs><rect width="64" height="64" fill="url(#nx-bg)"/><path fill="url(#nx-g)" fill-rule="evenodd" d="${DROP}"/></svg>`;

export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
