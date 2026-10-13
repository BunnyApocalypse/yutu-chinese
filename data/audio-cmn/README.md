# Recordings of Mandarin words and syllables

Spoken Mandarin for the app's "Listen" button: one recording for each of about 8,500 words and characters, and one for each of 1,707 syllables in each tone, which the app plays one after another for a word that has no recording of its own.

- `words/cmn-<characters>.mp3`: words and single characters of the HSK word list of 2000, in simplified characters, spoken by Yue Tan. (A few files are sentence patterns with gaps, like `从_到_`; the app leaves those out.)
- `syllables/cmn-<pinyin><tone>.mp3`: every syllable in its four tones (`ma1` to `ma4`; `v` stands for ü), spoken by Chen Wang. Only 19 syllables have a neutral-tone recording (tone 5).

`scripts/copy-audio.js` copies them to where the app fetches them from, under plain file names.

## Source

[hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) at commit `ff9ed3d`: the folders `64k/hsk` and `64k/syllabs`, copied unchanged (about 125 MB). The project also has smaller versions, down to 43 MB (`18k-abr`); the app used that one for a day in October 2026, and the owner found it audibly compressed, the 24k one too. The word recordings come from the Shtooka project's collection `cmn-caen-tan`.

## License

Creative Commons Attribution-ShareAlike (CC BY-SA), as the project states. Credit: syllables recorded by Chen Wang; words recorded by Yue Tan (Shtooka project, <http://packs.shtooka.net/cmn-caen-tan/readme.txt>); collected and compressed by Hugo Lopez. The recordings are not covered by the GPL that applies to the app's code; they are kept as separate files that the app plays.

## Updating

Copy the two folders again from the project and record the new commit above. Raise `AUDIO_VERSION` in `scripts/copy-audio.js` if file names change.
