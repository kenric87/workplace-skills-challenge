# Workplace Lab prototype

A mobile-friendly static website with four workplace scenarios and 10 decisions. Each choice plays a predefined character reply, then shows the scenario explanation and related rules. The final report includes a radar chart for compliance, judgment, and communication practice indicators.

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

The interface and scenarios are in English. This practice challenge uses predefined responses and does not call an AI service or send answers to an external API.

For each dimension, the radar chart averages the selected choice effects (each scored from -2 to +2) and maps that average to a 0–100 practice indicator, with 50 as the neutral midpoint. These are illustrative feedback based on a small set of predefined choices, not validated measurements of ability or predictions of workplace performance.

The “Unexpected Deadline” scenario is fictional practice content; its capacity-planning suggestions are not additional official policy. Before public use, verify the source wording and exact license for the adapted GitLab Handbook content. This prototype is not official GitLab training.

The Vercel/Gemini function in `api/feedback.js` is not used by the website interface and remains out of scope while AI coaching is paused.
