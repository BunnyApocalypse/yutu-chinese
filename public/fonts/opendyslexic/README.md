# OpenDyslexic

The font used when Settings › Look and sound › Font is "OpenDyslexic" (`src/font.js`).

- **Source:** [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic), commit `1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7`, files `compiled/OpenDyslexic-Regular.woff2` and `compiled/OpenDyslexic-Bold.woff2`, unchanged.
- **License:** SIL Open Font License 1.1 (`OFL.txt`), copyright Abbie Gonzalez, with Reserved Font Name OpenDyslexic. The font stays a separate file the app loads, never part of the app's code.

Fetched with:

    SHA=1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7
    for f in compiled/OpenDyslexic-Regular.woff2 compiled/OpenDyslexic-Bold.woff2 OFL.txt; do
      curl -sSfL -o public/fonts/opendyslexic/$(basename $f) https://raw.githubusercontent.com/antijingoist/opendyslexic/$SHA/$f
    done
