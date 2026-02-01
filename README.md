# Abijah Kajabika

Personal site and newsletter signup. Built with React, TypeScript, and Vite.

## Scripts

- **`yarn dev`** — Start dev server (Vite)
- **`yarn build`** — Production build (output in `dist/`)
- **`yarn preview`** — Preview production build locally

## Newsletter form (Formspree)

The subscribe form uses [Formspree](https://formspree.io/) (free tier: 50 submissions/month).

1. Sign up at [formspree.io](https://formspree.io/)
2. Create a new form and copy the form ID from the endpoint (e.g. `xyzabcde` in `formspree.io/f/xyzabcde`)
3. Create a `.env` file in the project root with:
   ```
   VITE_FORMSPREE_FORM_ID=your_form_id
   ```
4. Restart the dev server. Submissions will appear in your Formspree dashboard and can be emailed to you.

Without `VITE_FORMSPREE_FORM_ID`, the form still works in dev but only logs the email to the console.
