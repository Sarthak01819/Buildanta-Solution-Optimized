# Previous Buildanta consultation animation

Saved before switching the default to the standalone ZeroMirror scene.

The original fist-bump model, meadow assets and `src/gl/consultMeet.js` remain
in the working site. Preview that animation at
`http://localhost:5173/?consultAnimation=legacy`. Remove the query parameter to
return to the default ZeroMirror scene. No assets need to be restored.

These snapshots additionally preserve the previous integration files:

- `ConsultHand.js` → `src/gl/ConsultHand.js`
- `consultMeet.js` → `src/gl/consultMeet.js`
- `intro.js` → `src/modules/intro.js`
- `main.css` → `src/styles/main.css`

They are reference backups, not modules imported by the current build. Restore
only deliberately: copying them back would also undo subsequent improvements.
