// Standalone entry.
//
// The world's whole implementation now lives in world-app.js as a factory, so
// the Buildanta site can mount it inside a container of its own. Here it owns
// the page, which is what it always did: host is the document, and the panels
// append to <body>. Nothing about the standalone build changed — the 137
// headless checks are the proof of that, not this comment.
import { createWorld } from './world-app.js'

createWorld({ host: document, mountRoot: document.body })
