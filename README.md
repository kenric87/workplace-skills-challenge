# Workplace Lab prototype

A mobile-friendly static website with four workplace scenarios and 10 decisions. Each scenario begins with a character-led preview; each choice then plays a predefined reply before showing the scenario explanation and related rules. The final report includes a radar chart for compliance, judgment, and communication practice indicators.

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

The interface and scenarios are in English. Regular choices use predefined responses. A custom written answer is sent to the Vercel function in `api/feedback.js`, which calls Groq with only the current question, relevant answer choices, applicable guidance, and the learner's answer. Groq returns a brief in-character response, a short reason, and a practice score from +1 to +5; custom answers never subtract points. The score updates about half a second after the response appears. The radar chart applies the custom answer's overall rating equally to its three illustrative dimensions.

The home page includes expandable scenario missions and a progression dashboard. Learners earn XP for each new decision (with a bonus for aligned responses); skills and fictional character-rapport indicators are based on first answers and are saved in the current browser using local storage. These indicators are practice feedback, not validated skill or relationship assessments.

For deployment, set `GROQ_API_KEY` as a secret environment variable in Vercel for Production, then redeploy the project. The API key must not be added to the static site or committed to source control. The function defaults to Groq model `openai/gpt-oss-20b`; set `GROQ_MODEL` in Vercel if you want to use another model available to your Groq account. The static GitHub Pages site calls the Vercel endpoint configured in `ai-config.js`.

The overall score starts at 70. Each aligned choice adds 3 points. An ordinary unaligned choice subtracts 3 points, while choices explicitly marked as severe (such as disclosing sensitive information or commenting on a media inquiry) subtract 6. A custom answer always adds 1–5 points and never subtracts points. The score bar is green from 70 to 100, yellow from 60 to under 70, and red below 60. Question position is shown as text rather than a progress bar. The result shows the total score and a radar chart, not separate numeric scores for each dimension. The chart summarizes the three practice dimensions (compliance, judgment, and communication) from the selected choices, and a perfect total score fills all three axes. Scores and the chart are illustrative practice feedback, not validated measurements of ability or predictions of workplace performance.

The “Unexpected Deadline” scenario is fictional practice content; its capacity-planning suggestions are not additional official policy. Before public use, verify the source wording and exact license for the adapted GitLab Handbook content. This prototype is not official GitLab training.
