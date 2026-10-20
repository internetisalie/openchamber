# Transcript completion

## Ownership

This module owns local transcript phrase matching and its CodeMirror ghost text.
`ChatInput` supplies the rendered composer's runtime, directory and session, reads
its cached sync snapshot, and routes acceptance after the existing autocomplete
pickers. `ComposerEditor` owns installation into a retained editor view.

## Invariants

- Enabled by default for desktop-sized web and Electron composers in normal
  input mode, without URL flags, special builds or a persisted setting. VS Code,
  hosted mobile and native Capacitor shells are excluded. Capacitor stays excluded
  at wide viewports. New-session drafts, BTW, pickers, dictation and blocking
  forms retain their existing behavior.
- Use loaded visible text from user and completed assistant messages in this
  session. Reverted records, other message roles, non-text parts and text marked
  synthetic or ignored in metadata are excluded. Missing cached data means no
  suggestion, not an authoritative statement that history is empty.
- Matching runs after a 150 ms pause after typing or successful acceptance.
  Showing a ghost does not schedule another lookup. Escape cancels pending or
  visible suggestions until new typing. Scope changes, selection movement,
  edits, blur, composition and disabling cancel obsolete suggestions. Restored
  drafts do not trigger matching. Acceptance revalidates against current cached
  transcript state.
- Ghost text is a decoration, not document content. Plain Tab accepts a visible
  suggestion, plain Escape dismisses it, and Enter keeps its existing send policy.
  When no suggestion is visible, Tab retains its existing agent/focus behavior.
  Acceptance is one separately undoable insertion through `replaceWithCaret`,
  including any trailing space. Undo cancels a pending or visible next suggestion
  and does not itself trigger matching.
- Read at most 80 recent records and 65,536 characters. Match up to three preceding
  words and the current prefix, prefer longer context, and break ties by recency.
  Emit at most 3 words, counting the word being completed, and 72 characters.
  Stop at punctuation or before common English prepositions and clause connectors.
  Back off a trailing article at the hard cap. These are phrase-size hints, not
  grammatical parsing; other languages retain the word and punctuation limits.
  Include one trailing ASCII space when the observed phrase ends in a plain
  letter/number word followed by that space, within the 72-character cap.
  Do not add a space after an identifier or punctuation, before adjacent
  punctuation, at a line/message end, or from tabs/newlines. The optional space
  is part of the ghost and is revalidated with it at acceptance.
  Compound identifiers stay intact. No inference, embedding, network request,
  stored transcript copy, or background subscription is added.
- The optional bubbling `openchamber:transcript-completion` event carries only
  `{ action, characters }`, with action `shown`, `accepted` or `dismissed`.
  No collector, telemetry upload, or productivity claim is part of the feature.

## Decisions

### Why bounded phrase hints instead of grammatical parsing

Short suggestions reduce how much continuation a person has to inspect before
accepting it. A 3-word cap and local boundary hints replace the original 5-word
window, which could end in the middle of the next phrase. Full noun-phrase
recognition would require language-specific parsing beyond this dependency-free
matcher; the hints deliberately make no grammatical guarantee. Human evaluation
of typing saved versus distraction remains unmeasured; functional tests do not
establish a productivity gain.

### Why acceptance schedules one more lookup

Repeated Tab accepts short phrases without a typed character between them. The
same 150 ms delay keeps each new suggestion separate. Only a successful insertion
starts this lookup; rendering, dismissal, stale acceptance and Undo do not.
Spacing comes from the matched transcript so acceptance cannot invent a boundary
inside an identifier or before punctuation. Keeping the space inside the same
insertion makes Undo remove the entire accepted chunk.
