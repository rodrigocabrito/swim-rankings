'use client';

import { useEffect, useRef, useState } from 'react';
import manifest from '../lib/logos-manifest.json';

// Default logo for clubs without their own (Portuguese Swimming Federation).
const DEFAULT_LOGO = '/logos/FPN.png';
const HAS_LOGO = new Set(manifest.codes);
const HAS_DARK = new Set(manifest.darkCodes || []); // clubs with a <CODE>-dark.png

// Resolve the correct URL up front (from the build-time manifest) so the very
// first render points at a file that exists — no 404 flash before falling back.
function resolveSrc(code) {
  if (code && HAS_LOGO.has(code)) return `/logos/${code}.png`;
  if (manifest.hasDefault) return DEFAULT_LOGO;
  return null; // nothing available -> monogram
}

export default function ClubLogo({ code, name, size = 44 }) {
  const initial = resolveSrc(code);
  const [src, setSrc] = useState(initial);
  const [failed, setFailed] = useState(initial === null);
  const imgRef = useRef(null);
  const dim = { width: size, height: size };

  // Safety net only: if a listed file somehow fails to load, fall back further.
  function handleError() {
    if (src && src !== DEFAULT_LOGO && manifest.hasDefault) setSrc(DEFAULT_LOGO);
    else setFailed(true);
  }
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) handleError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (failed || !src) {
    return (
      <div className="club-logo club-logo--fallback" style={dim} aria-hidden="true">
        {(code || '?').slice(0, 3)}
      </div>
    );
  }

  // If the club has a dark-mode variant, render both and let CSS swap by theme.
  if (code && HAS_DARK.has(code) && src === `/logos/${code}.png`) {
    return (
      <>
        <img className="club-logo club-logo--light" src={src} alt={`${name} logótipo`} style={dim} />
        <img className="club-logo club-logo--dark" src={`/logos/${code}-dark.png`} alt="" style={dim} />
      </>
    );
  }

  return (
    <img
      ref={imgRef}
      className="club-logo"
      src={src}
      alt={`${name} logótipo`}
      style={dim}
      onError={handleError}
    />
  );
}
