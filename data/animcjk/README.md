# animCJK traditional Chinese stroke data

`graphicsZhHant.txt` is copied unchanged from the [animCJK](https://github.com/parsimonhi/animCJK) project, at commit `98186d55b22cf70e86a248502513c2148f2a6bdf` (2026-05-11).

It holds stroke data for 1,013 traditional characters in Taiwan-standard forms, one character per line, in the same format as Make Me a Hanzi's `graphics.txt`: `character`, `strokes` (one SVG outline per stroke) and `medians` (the points down the middle of each stroke).

The app uses it in place of the `hanzi-writer-data` package when the script is set to Traditional, because that package draws many traditional characters in mainland-style forms (for example 為 as 爲).

## License

AnimCJK 2016-2026 Copyright FM-SH. Derived from the Make Me a Hanzi project and the Arphic PL KaitiM GB and Arphic PL KaitiM Big5 fonts. Redistributed under the Arphic Public License, the same license as `hanzi-writer-data`; its text is shipped with the app as `char-data/ARPHICPL.TXT`.

## Updating

Download the newer `graphicsZhHant.txt` from the animCJK repository, replace the file, update the commit above, delete `public/char-data-tw/` and run `npm run dev` or `npm run build` to copy it again.
