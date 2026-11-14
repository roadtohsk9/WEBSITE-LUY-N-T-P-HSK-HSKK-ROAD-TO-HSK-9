# V47 — Summary state + explanation scroll hardening

- Fixed Summary / Note Completion persistence for Reading + Listening VOL / Practice Test with a dedicated summaryAnswers store.
- Summary inputs now persist on input/change and are merged into the final submission before grading.
- Passage/Section rerenders no longer clear answers from other units.
- Final submit snapshots the current Summary DOM and merges all saved Summary answers into the submission payload.
- Detailed Explanation desktop layout now uses full viewport height with independent scroll panes for source/transcript and answer explanations.
- Mobile/tablet keeps normal page flow and readable scrolling.
- Test Centre / Thi thử files are not modified by V47.
