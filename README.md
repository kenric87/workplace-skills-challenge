# Workplace Lab prototype

A mobile-friendly, static website with three workplace scenarios and up to nine decisions. The final report includes a radar chart for compliance, judgment, and communication practice indicators.

## Run locally

The page loads its scenarios and rulebook as JSON, so open it through a local web server rather than directly as a `file://` URL.

From this folder, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publish the static site with GitHub Pages

1. Create a GitHub repository and upload this folder's files, keeping the JSON files beside `index.html`.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Wait for the Pages deployment to finish. GitHub will show the public website URL in the Pages settings.

The interface and scenarios are in English. Keep `ai-config.js` empty until the Vercel API is deployed; never put a Gemini API key in this file or any other browser-side code.

For each dimension, the radar chart averages the selected choice effects (each scored from -2 to +2) and maps that average to a 0–100 practice indicator, with 50 as the neutral midpoint. These are illustrative feedback based on this small set of predefined choices, not validated measurements of ability or predictions of workplace performance.

Before public use, verify the source wording and exact license for the adapted GitLab Handbook content. This prototype is not official GitLab training.

## Enable AI coaching with Vercel and Gemini

After the player opts in, the GitHub Pages site calls a Vercel serverless function at `api/feedback.js`. The browser sends only the scenario IDs and selected option IDs. The function reconstructs the answer history from the repository's scenario files, calculates the lowest practice indicator, and asks Gemini for one rule-grounded feedback summary and one optional follow-up question. The AI follow-up does not change the radar chart. No name is requested or sent.

1. Create a Gemini API key in Google AI Studio. Do not paste it into chat, GitHub, `ai-config.js`, or any file in this repository.
2. Import `kenric87/workplace-skills-challenge` into Vercel. Deploy from the repository root.
3. In Vercel, add the `GEMINI_API_KEY` environment variable with the key from Google AI Studio. Optionally set `GEMINI_MODEL` (defaults to `gemini-3.8-flash`). If Gemini reports a model as unavailable (HTTP 404), the function tries `gemini-3.7-flash` and `gemini-3.6-flash`. For temporary 503 outages, it retries with exponential backoff before trying fallback models. If all models remain unavailable, the API reports HTTP 503 and includes a clearly labeled rule-based practice backup; it is not presented as AI-generated. A persistent 503 indicates provider availability/capacity, while invalid credentials normally return 401/403 and quota/billing issues have their own error codes. Redeploy after changing environment variables.
4. Confirm the deployed function is available at `https://YOUR-VERCEL-DOMAIN/api/feedback`.
5. Set `window.WORKPLACE_AI_ENDPOINT` in `ai-config.js` to that function URL, for example:

   ```js
   window.WORKPLACE_AI_ENDPOINT = "https://your-project.vercel.app/api/feedback";
   ```

6. Commit and push the `ai-config.js` change to `main`. GitHub Pages will publish the updated site.
7. Test the AI coach from the published site. The Vercel function allows requests from `https://kenric87.github.io` and local development origins by default. If your Pages domain changes, set `ALLOWED_ORIGINS` in Vercel to the new origin(s), comma-separated.

The AI endpoint is public and has no user account or persistent storage. Gemini's own quotas still apply; set usage limits or monitoring in the provider account. The function limits request size and validates generated rule references, but this prototype is not a substitute for durable abuse prevention. Do not send confidential source documents or personal data.
