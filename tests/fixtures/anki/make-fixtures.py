# Builds the small Anki files the tests read (tests/ankiImport.test.js).
#
# Run by hand, only when the files need to change. It needs Anki's own Python
# package, which is not one of the app's dependencies (see README.md here):
#
#   python3 -m venv local/anki-venv
#   local/anki-venv/bin/pip install anki
#   local/anki-venv/bin/python -I tests/fixtures/anki/make-fixtures.py
#
# Anki makes the files itself, in each of the formats a learner may bring:
#   new.apkg      a deck export from a current Anki (zstd-compressed, schema 18)
#   legacy.apkg   the same with "Support older Anki versions" ticked (schema 11)
#   shared.apkg   the same without scheduling, as a shared deck comes
#   whole.colpkg  a whole collection backup

import json
import os
import shutil
import sys
import tempfile

from anki.collection import Collection, ExportAnkiPackageOptions, DeckIdLimit

HERE = os.path.dirname(os.path.abspath(__file__))

# The collection's "creation time", from which Anki counts the days a review
# card is due on: 2026-01-01 04:00 UTC. Fixed so the files are the same each
# time they are made.
CRT = 1767240000
DAY = 86400


def ms(day, hour=0):
    """A time as Anki's review log keeps it: milliseconds, `day` days after CRT."""
    return (CRT + day * DAY + hour * 3600) * 1000


def main():
    work = tempfile.mkdtemp()
    col = Collection(os.path.join(work, 'collection.anki2'))
    col.db.execute('update col set crt = ?', CRT)

    # A note type made for Chinese, as many learners set one up: three cards
    # from four fields.
    models = col.models
    chinese = models.new('Chinese (Yutu test)')
    for name in ['Hanzi', 'Pinyin', 'Meaning', 'Audio']:
        models.add_field(chinese, models.new_field(name))
    for name, front, back in [
        ('Recognition', '{{Hanzi}}', '{{FrontSide}}<hr id=answer>{{Pinyin}}<br>{{Meaning}}'),
        ('Recall', '{{Meaning}}', '{{FrontSide}}<hr id=answer>{{Hanzi}}<br>{{Pinyin}}'),
        ('Listening', '{{Audio}}', '{{FrontSide}}<hr id=answer>{{Hanzi}} {{Meaning}}'),
    ]:
        template = models.new_template(name)
        template['qfmt'] = front
        template['afmt'] = back
        models.add_template(chinese, template)
    models.add(chinese)
    chinese = models.by_name('Chinese (Yutu test)')
    basic = models.by_name('Basic')

    hsk1 = col.decks.id('Chinese::HSK 1')
    extra = col.decks.id('Chinese::Extra')
    parent = col.decks.id('Chinese')

    def add(model, deck, fields):
        note = col.new_note(model)
        for index, value in enumerate(fields):
            note.fields[index] = value
        col.add_note(note, deck)
        return note

    nihao = add(chinese, hsk1, ['你好', 'nǐ hǎo', 'hello', '[sound:nihao.mp3]'])
    xuexiao = add(chinese, hsk1, ['学校', 'xue2xiao4', 'school', ''])
    xiexie = add(chinese, hsk1, ['<b>谢谢</b>', 'xièxie', 'thank you', ''])
    add(chinese, hsk1, ['Measure words', '', 'a list of measure words', ''])
    pengyou = add(chinese, hsk1, ['朋友', 'péngyou', 'friend', ''])
    nihao_again = add(chinese, extra, ['你好', 'nǐhǎo', 'hi', ''])
    zhongguo = add(chinese, extra, ['中國', 'Zhōngguó', 'China', ''])
    laoshi = add(basic, parent, ['老师', 'lǎoshī<br>teacher'])

    def card(note, ord):
        return next(c for c in note.cards() if c.ord == ord)

    def schedule(c, *, type, queue, due, ivl=0, factor=2500, reps=0, lapses=0, left=0):
        col.db.execute(
            'update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=? where id=?',
            type, queue, due, ivl, factor, reps, lapses, left, c.id,
        )

    def log(c, when, ease, type, ivl=0, last_ivl=0, factor=2500, taken=4000):
        col.db.execute(
            'insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)',
            when, c.id, -1, ease, ivl, last_ivl, factor, taken, type,
        )

    # 你好, Recognition: learned on day 10, forgotten once on day 14, now a
    # review card due on day 300.
    c = card(nihao, 0)
    log(c, ms(10), 3, 0, ivl=-600, taken=6000)
    log(c, ms(10, 1), 3, 0, ivl=1, last_ivl=-600, taken=3000)
    log(c, ms(11), 3, 1, ivl=3, last_ivl=1, taken=2500)
    log(c, ms(14), 1, 1, ivl=-600, last_ivl=3, factor=2300, taken=90000)
    log(c, ms(14, 1), 3, 2, ivl=1, last_ivl=-600, factor=2300, taken=5000)
    log(c, ms(15), 4, 1, ivl=20, last_ivl=1, factor=2450, taken=1500)
    schedule(c, type=2, queue=2, due=300, ivl=20, factor=2450, reps=6, lapses=1)
    # 你好, Recall: two reviews, due on day 290. Listening stays new.
    c = card(nihao, 1)
    log(c, ms(10, 2), 3, 0, ivl=1, taken=8000)
    log(c, ms(11, 1), 2, 1, ivl=4, last_ivl=1, factor=2350, taken=12000)
    schedule(c, type=2, queue=2, due=290, ivl=4, factor=2350, reps=2)

    # 学校, Recognition: scheduled by Anki's FSRS, so its memory state is
    # stored with the card.
    c = card(xuexiao, 0)
    log(c, ms(20), 3, 0, ivl=2, taken=4000)
    log(c, ms(22), 3, 1, ivl=9, last_ivl=2, taken=4000)
    schedule(c, type=2, queue=2, due=310, ivl=9, reps=2)
    c = col.get_card(c.id)
    from anki.cards import FSRSMemoryState
    c.memory_state = FSRSMemoryState(stability=9.5, difficulty=4.25)
    col.update_card(c)
    # 学校, Recall: reviewed once, then "Forget" (reset to new) on day 25.
    c = card(xuexiao, 1)
    log(c, ms(21), 3, 0, ivl=1, taken=4000)
    log(c, ms(25), 0, 4, ivl=0, last_ivl=1, factor=0, taken=0)
    schedule(c, type=0, queue=0, due=5)

    # 谢谢, Recognition: a review card the learner suspended.
    c = card(xiexie, 0)
    log(c, ms(12), 3, 0, ivl=5, taken=4000)
    schedule(c, type=2, queue=-1, due=280, ivl=5, reps=1)

    # The second 你好 note: fewer reviews than the first, so it loses.
    c = card(nihao_again, 0)
    log(c, ms(30), 4, 0, ivl=4, taken=2000)
    schedule(c, type=2, queue=2, due=295, ivl=4, reps=1)

    # 中國, Recognition: in its learning steps, due at a moment, not a day.
    c = card(zhongguo, 0)
    log(c, ms(40), 1, 0, ivl=-600, taken=7000)
    schedule(c, type=1, queue=1, due=CRT + 40 * DAY + 600, left=1001)

    # 老师 on the Basic note type: one review card, due on day 305.
    c = card(laoshi, 0)
    log(c, ms(18), 3, 0, ivl=7, taken=4000)
    schedule(c, type=2, queue=2, due=305, ivl=7, reps=1)

    # 朋友 is never studied.
    assert pengyou

    with_scheduling = ExportAnkiPackageOptions(
        with_scheduling=True, with_deck_configs=False, with_media=False, legacy=False
    )
    everything = DeckIdLimit(deck_id=parent)
    col.export_anki_package(out_path=os.path.join(HERE, 'new.apkg'), options=with_scheduling, limit=everything)
    with_scheduling.legacy = True
    col.export_anki_package(out_path=os.path.join(HERE, 'legacy.apkg'), options=with_scheduling, limit=everything)
    shared = ExportAnkiPackageOptions(
        with_scheduling=False, with_deck_configs=False, with_media=False, legacy=False
    )
    col.export_anki_package(out_path=os.path.join(HERE, 'shared.apkg'), options=shared, limit=everything)
    col.export_collection_package(os.path.join(HERE, 'whole.colpkg'), include_media=False, legacy=False)
    col.close()
    shutil.rmtree(work)
    print('Made new.apkg, legacy.apkg, shared.apkg and whole.colpkg in', HERE)


if __name__ == '__main__':
    sys.exit(main())
