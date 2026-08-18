# Club logos

Place club logos here, **named by the club code**, as PNG:

```
web/public/logos/CFB.png
web/public/logos/SCP.png
web/public/logos/SLB.png
...
```

- **Filename = club code** (from `clubs.json`), uppercase, `.png` extension.
- **Format:** PNG with a transparent background works best.
- **Shape:** square-ish; it's shown at up to ~56px, rounded corners applied by CSS.

## Default logo

Add **`FPN.png`** here — it's the default shown for any club that doesn't have
its own logo file. Fallback order:

```
/logos/<CODE>.png   →   /logos/FPN.png   →   code monogram
```

The monogram (club code in a soft blue badge) only appears if even `FPN.png`
is missing, so the layout never breaks.

To change the expected extension (e.g. to `.svg` or `.webp`), edit the `src`
in `web/app/ClubLogo.js`.
