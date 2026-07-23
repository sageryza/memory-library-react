# ShouldiMakeThis.com — Firebase build brief

## What this is
A preorder / product-validation site. Visitors browse products I'm considering making,
vote thumbs up/down ("should this exist?"), heart items, preorder, and invest small
amounts to signal demand. The whole point is to collect that signal so I know what to produce.

## What's in this folder
- `src/App.jsx` — the finished front end (v38). Layout, styling, and all interactions are done. **Don't redesign it.**
- `public/images/` — 67 product photos, already referenced by `App.jsx` as `/images/<key>.jpg`

## Current state
Everything works but nothing persists. Specifically:
- `signedIn` is a `useState(false)` boolean; `SignInModal` has a fake "Continue with Google" button that just flips it
- Votes, hearts, preorders, and investments all live in local component state and vanish on refresh
- The product catalog is a hardcoded `seed` array in `App.jsx`

## What I need built

### 1. Scaffold
Set this up as a Vite + React app in a new Firebase project, keeping `App.jsx` and `public/images/` as they are.
Dependencies needed: `react`, `react-dom`, `firebase`, `lucide-react`, and Tailwind
(the JSX uses a few Tailwind utility classes alongside inline styles — make sure they compile).

### 2. Auth
Replace the mocked sign-in with **real Firebase Auth using Google sign-in**.
- Keep `SignInModal`'s existing look — just make the button call `signInWithPopup`
- Keep the current trigger behavior: an anonymous visitor who hearts/votes/preorders gets the modal, and their action completes after they sign in
- Add a way to sign out (small, unobtrusive — match the existing aesthetic)

### 3. Firestore
**Keep the product catalog hardcoded in `App.jsx`.** It's static and I edit it by hand. Only store *interactions*.

Suggested shape:
```
products/{productId}                       — aggregates: voteUp, voteDown, hearts, reserved, raised
products/{productId}/votes/{uid}           — { dir: "up" | "down", at }
products/{productId}/hearts/{uid}          — { at }
products/{productId}/preorders/{uid}       — { variant, at }
products/{productId}/investments/{uid}     — { amount, pay: "now" | "later", at }
submissions/{submissionId}                 — user-submitted items (see section 6)
```
- One vote / heart / preorder per user per product; voting the same direction again clears it (that's the existing behavior)
- Update the aggregate in a transaction or batch alongside the per-user doc so counts stay correct
- Use real-time listeners so counts and funding bars reflect what's actually stored
- Product IDs are the numeric `id` values already in the `seed` array

### 4. Security rules
- Anyone (signed in or not) can **read** aggregates
- Only a signed-in user can write, and only to a doc whose id equals their own `uid`
- Nobody can write aggregate counts directly from the client except through the transaction described above
- If that's awkward to secure, use a Cloud Function to maintain aggregates instead and lock aggregate writes entirely — your call, just tell me which you did

### 5. Results view (private, for me only)
A separate route — `/results` — that is the actual payoff of the site. Not linked from the public nav.
- Gate it to my account only (hardcode my uid, or an `admins` collection — your call)
- A table or list of every product with: thumbnail, title, 👍 count, 👎 count, hearts, preorders, total invested, and number of investors
- Sortable, and defaulting to the most useful signal — probably preorders, or net vote (up minus down)
- Include the user-submitted items (see below) in the same view
- Let me export it as CSV
- Match the existing aesthetic: cream `#faf7f1`, ink `#1c1b19`, EB Garamond + Jost, no drop shadows, no gradients, 6px radius

### 6. User-submitted items
`NewItemForm` and its "Post item" button already exist in `App.jsx` and are open to everyone.
Right now submissions go into local state only. Make them real:
- Require sign-in to submit (same modal flow as everything else)
- Store in a `submissions` collection with the submitter's uid and a `status` field
- **Default `status` to `"pending"`** — submissions should not appear publicly until I approve them. I'd rather approve than moderate after the fact.
- Add approve/reject controls to `/results` so I can action them there
- Approved submissions appear in the grid alongside my products and can be voted/hearted/preordered like anything else. They should be visually indistinguishable from mine — no "submitted by" badge unless I ask for one.
- The form currently takes an **image URL**, which is awkward for a real person. Replace it with a file upload to Firebase Storage, keeping the form's existing look and field order.

### 7. Deploy
Firebase Hosting. Give me the live `.web.app` URL when it's up.
I own other domains through Hover, so tell me the DNS records if I want to point a custom domain later — but don't block on that.

## Notes
- Payments are not real and shouldn't be. "Preorder" and "invest" only record intent for now.
- Don't add features I haven't asked for, and keep the interface clean — no extra labels or instructions.
- If something in `App.jsx` is ambiguous, ask me before changing it.
