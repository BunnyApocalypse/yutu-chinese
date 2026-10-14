# Running the alpha

For the owner. The aim of this round is to find out where people get stuck and whether they would keep using the app, not to collect opinions about how it looks.

## Who to ask

Five people are enough for a first round: most of the serious problems show up within the first three, and after five you mostly hear the same things again. Fix what they found, then ask five different people.

Try to cover different ground, since each kind of learner hits different parts of the app:

- a beginner (under a year of Chinese), who will use the ready-made lists and the lessons;
- someone who has used another flashcard app for years, who will compare and will go looking for settings;
- someone who learns traditional characters, and someone who learns simplified;
- someone who studies mostly on a phone, and someone who uses a tablet with a stylus.

Avoid starting with close friends who want to be kind. If you do use friends, tell them plainly that finding faults is the favor.

## Before you hand it over

- Use the app yourself for a week first. Anything that annoys you will annoy them, and you can fix it before it uses up a tester's patience.
- Decide the address testers will use and do not change it during the round: their words and progress are stored under that address in their own browser, and a new address starts empty. Decided on 2026-10-14: **https://bunnyapocalypse.github.io/hanzi-trainer/** (the stable copy).
- Decide how feedback reaches you. Decided on 2026-10-14: the email alias **hanzifeedback.veggie892@passmail.com**, plus the issue tracker for testers with a GitHub account. One channel is better than three.
- Check that the app says which version it is, so a report can name it. (It does not yet; see the review of what real users imply.)

## What to tell testers, and what not to

Tell them:

- that it is an early test version, made by one person, and free;
- that everything they enter stays on their own device and nothing is sent anywhere, which also means you cannot see their data or rescue it;
- that they should export a backup now and then (Settings, "Your data and backups"), and that on an iPhone or iPad the app must be added to the Home Screen or the browser may clear its data after a week without use;
- that things may change under them, and that in the worst case an update could ask them to start over;
- how long you would like them to try it (two weeks of ten minutes a day is a good ask) and how to report.

Do not tell them:

- how to do things. No tour, no tips, no "Settings is in the menu". The introduction inside the app is what a stranger would get; if it is not enough, that is a finding.
- what you think is good or unfinished. It steers what they notice.
- what you hope they will say.

## Two ways of testing, and why you want both

**Watching (30 minutes, once per tester, at the start).** Sit beside them, or share a screen, and ask them to do the tasks in `tasks.md` while saying aloud what they are thinking. This shows you where the app is unclear, which people rarely report by themselves because they blame themselves for it.

Rules for yourself while watching:

- Do not help. When they are stuck, wait. Count to ten. If they ask you a question, ask back: "What would you expect?" or "What would you try?"
- Do not explain or defend anything. Write it down instead (`observation-sheet.md`).
- Step in only when they are truly stuck for a minute or more, note that you did, and then stay quiet again.
- At the end ask three things: what was the most confusing moment, what did they expect that was not there, and would they open it again tomorrow.

**Living with it (two weeks, by themselves).** This shows you what watching cannot: whether the daily habit holds, whether the scheduling feels right, what breaks on their device. They answer `feedback-questions.md` at the end. Ask them to note things as they happen, in whatever is quickest for them; memories of small annoyances fade within a day.

## What to do with what comes back

- Write each finding as what happened, not as the fix someone proposed: "could not find where to add a word" and not "move the add button".
- Count how many testers hit each one. Something three of five people hit is a real problem; something one person mentioned once may be taste.
- Sort into: stopped them (fix before the next round), slowed them (fix soon), and wished for (a list to look at when planning features).
- Tell testers what you changed because of them. It is the cheapest way to keep them.

## What not to conclude from five people

Whether people like it, how many would use it, or which feature matters most to learners in general. Five testers find problems; they do not measure demand.
