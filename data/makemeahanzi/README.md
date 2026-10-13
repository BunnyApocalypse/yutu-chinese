# Character dictionary from Make Me a Hanzi

`dictionary.txt` says how each of 9,574 characters is built: its decomposition into parts, its radical, and for most characters how it came about. For a sound-meaning compound (the great majority) it names the part that carries the meaning and the part that carries the sound. The app uses it to show the parts of a character.

One character per line, each a JSON object with `character`, `definition`, `pinyin`, `decomposition` (an ideographic description sequence such as `⿰氵可`), `radical`, `etymology` (`type`: `pictophonetic`, `ideographic` or `pictographic`, with `semantic`, `phonetic` and `hint` as they apply) and `matches` (which stroke belongs to which part).

## Source

[skishore/makemeahanzi](https://github.com/skishore/makemeahanzi), `dictionary.txt` at commit `bddc96d41bef`, copied unchanged. It is the project that the app's large stroke data set (`hanzi-writer-data`) is made from. The file is derived from Unihan and CJKlib.

## License

GNU Lesser General Public License, version 3 or later, as the project's `COPYING` file states for `dictionary.txt`; see <https://www.gnu.org/licenses/lgpl-3.0.html>. (The project's stroke graphics are under the Arphic Public License; they are not in this folder.) It is kept here as a separate data file, not pasted into the app's source.

## Updating

Download the file again from the project and record the new commit above.
