# Demo bug: "Save does nothing"

A profile form with one planted bug, used for the iVibe demo video and as the eval's demo case.

```sh
pnpm --filter @ivibe/demo-bug dev   # opens http://localhost:5174
```

**What you see:** edit a field, click **Save**: no "Saved ✓", no error on the page. DevTools shows `PUT /api/profile` returning **200** and an `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'tags')` in `saveProfile`.

**Root cause (don't show this before the model run):** the API moved to v2, which returns `{ profile: … }`; `ProfileForm.tsx` still reads `data.user.tags`. The fix is `data.profile.tags`.

Recording tips: keep DevTools open on Console, click Save two or three times, and narrate what you expected.
