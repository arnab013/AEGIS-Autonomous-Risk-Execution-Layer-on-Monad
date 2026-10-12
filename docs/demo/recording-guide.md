# Aegis demo: voiceover and screen recording

Use one calm, conversational voice. The story is a trader moving from evidence to an approved change, then reviewing a sale and seeing a proposal blocked. Aim for **2:45–2:55**, leaving room below the competition's three-minute limit. The exact runtime depends on the audio you generate and your edit.

The narration is split into seven plain-text clips under `narration/`. Each file contains only words to speak. `narration-full.txt` combines the default clips for a single generation. If your wallet cannot prepare a sale, substitute the unavailable-sale clip before generating the combined audio.

## Audio in ElevenLabs

1. Generate clip 01 first and listen for the product names. Use the same voice, model and settings for every clip.
2. Start at normal speed, around 1.0. Aim for roughly 125–135 spoken words per minute, with brief pauses between paragraphs. The default script is 330 words: about 2:27–2:38 of speech at that pace, before reading holds and the end card. Measure your actual generated audio; the speed setting alone does not guarantee a duration.
3. Paste only the narration text. Keep headings, timestamps, recording actions and chat prompts out of the speech input.
4. Save the audio as `01-introduction`, `02-live-context`, and so on. Generate the chosen version of clip 05 only.
5. Measure the total duration after generation. Leave about 10–15 seconds for transitions and the end card; keep the finished video below three minutes.

Suggested pronunciations: **Aegis** = “EE-jiss”; **Jev** rhymes with “rev”; **Kuru** = “KOO-roo”; **Monad** = “MOH-nad”; **MON** as one word, rhyming with “on”; **U S D C** as individual letters. These are delivery suggestions for this script. Test them with your chosen voice. If needed, use phonetic spelling in the speech input or a pronunciation dictionary while keeping the correct spelling in the video captions.

The scripts use punctuation and paragraph breaks rather than model-specific audio tags. ElevenLabs documents these controls and pronunciation aliases in its [speech best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

## Record these seven clips

The times are editing targets, not measured audio durations. Record each screen segment separately, with a few seconds of stillness at its beginning and end. Keep the text legible at 1080p and move the pointer only when it helps explain an action.

| Target time | Audio file | Screen recording |
| --- | --- | --- |
| 0:00–0:17 | `01-introduction.txt` | Start on the live homepage with the new logo and product heading. Click **Dashboard** near the end of the clip. |
| 0:17–0:38 | `02-live-context.txt` | Open **Market & execution**, select **Live Market**, and show MON/USDC, its source, observed block/time and depth. Show the visible session limits. Connect a wallet only if you want to show its real balances; disconnected fields are unavailable. |
| 0:38–1:06 | `03-scout-and-jev.txt` | Return to **Overview**, send the analysis prompt below, and record the actual Scout reply. Show the separate Jev finding and its provenance, then open captured evidence. Hold long enough for the inputs and checks to be readable. |
| 1:06–1:29 | `04-policy-approval.txt` | Send the policy prompt below. Show the proposed **25 → 10 bps** change, then click **Approve session change**. Show the applied value. |
| 1:29–2:05 | `05-sale-simulation.txt` | Return to live **Market & execution**. Choose a wallet- and market-valid MON amount, click **Prepare & simulate**, and show the successful simulation and exact review terms. Show the separate wallet confirmation control without clicking it. |
| 2:05–2:30 | `06-blocked-replay.txt` | Open **Stress replay**, choose **Scenario 5: Oversized Proposal Blocked**, use **Reset**, then **Step** until the blocked increase appears. Open evidence and show the failed position-cap check. Keep the synthetic/replay label visible. |
| 2:30–2:50 | `07-journal-and-close.txt` | Show the decision journal and the corresponding evidence, then finish with the homepage/logo and an end card containing the app and repository links. |

## Chat prompts to type, not narrate

For clip 03:

```text
Explain the current market, the Jev finding, and the most important limits. Do not propose or prepare a trade.
```

For clip 04, start with the session slippage limit at 25 bps:

```text
Propose lowering my session slippage cap from 25 to 10 bps. Explain before and after. Do not apply it or prepare a sale.
```

The policy prompt produced a real proposal in verification. Record the actual result of your request. If there is no matching approval card, change that segment's narration instead of presenting an applied change. Typing “yes” does not apply a policy or authorize a transaction.

## Choose the sale clip before generating audio

**Default: simulation only.** Use `narration/05-sale-simulation.txt` only after your recording shows a successful preparation/simulation. It requires a connected wallet with sufficient MON, a size at or above the currently displayed market minimum, an amount within the session limits, and MON left for gas. Keep the confirmed 10 bps setting if it passes the checks. If preparation fails, show the reason and use the alternative below. The earlier 200 MON verification used a funded public address for a read-only test; it is not an amount selected for your wallet.

**Preparation unavailable.** Replace clip 05 with `alternatives/05-sale-unavailable.txt` when the recording shows a blocker. Show the actual field error or failed check clearly. Do not put a trade-review screenshot from another address into your wallet's recording.

**Confirmed sale.** `alternatives/05-sale-confirmed.txt` is reserved for a recording in which you independently choose to sign and the app verifies the successful receipt, delivered USDC and refreshed balances. Signed execution has not yet been verified for this project. A submitted hash or pending state does not justify this narration. If a receipt wait is shortened, keep the same transaction hash visible before and after the cut. Do not confirm an expired proposal.

## Prepare and sync

- Complete **AI access → Project-funded trial** and the visitor check before the main take. Use the actual response, Jev finding and timestamps; do not script a particular market direction or probability. The two chat segments make explicit AI requests, so avoid unnecessary retakes or background requests.
- Start from a clean session with the default limits, then keep the session through clips 02–05. Reloading clears hosted conversations, policies and the journal. After the live clips, restore the default replay limits and use Reset before recording scenario 5; fills and policy edits otherwise carry between replay runs.
- Keep keys, wallet recovery words and unlock screens out of the recording. Save video/audio under F:.
- Generate the narration first. Record to its pacing, then align each click or panel reveal with the corresponding sentence. Add short silent holds where the viewer needs to read. Trim idle loading, and label shortened waits when their duration matters. Use captions with the correct product spellings; do not change the audio's speed merely to force a click into place.
- Keep the end card on screen for roughly four seconds. Use the closing voiceover over its first part, then a short silent hold.

## End card text

```text
Aegis
Evidence. Limits. Your final approval.
Developed by Arnab Saha.
© 2026 Arnab Saha.

Try the app: aegis.himaloy2608.workers.dev
Code: github.com/arnab013/AEGIS-Autonomous-Risk-Execution-Layer-on-Monad

Built with AI assistance. Source, attribution and pre-existing-work
disclosures are in the repository.
Voiceover generated with ElevenLabs.
```

Use the ElevenLabs credit when the audio has actually been generated there. Include the app and code URLs as clickable links in the video's description as well. Confirm the repository is public before publishing the video.

The [official competition rules](https://hackathon.monad.xyz/api/v1/policies/current), Rules v3 rechecked on 12 October 2026, require a public video of at most three minutes showing actual operation and Monad interactions. The default script demonstrates live reads, AI, application checks and simulation. It makes no confirmed-fill, autonomous-trading, audited-contract or profitability claim. Preserve the full submission disclosures in the repository.
