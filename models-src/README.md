# models-src

Put your original, unoptimised models here (`.glb` or `.gltf`). Git ignores everything in
this folder except this note, so a huge file can't end up in a commit by accident.

Then run:

```bash
npm run optimize-models
```

It writes a much smaller copy of each file to `public/models/`. That copy is the one you
commit and list in `MODELS` in `src/config.js`. See "Big models" in the main README.
