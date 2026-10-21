# Gives shared Anki decks made-up but realistic study histories, as if three
# learners had used them in Anki, and exports the results in the formats
# Anki makes. For trying the app's Anki import (docs/anki.md) on something
# bigger and messier than tests/fixtures/anki/.
#
# The decks are downloaded once into local/anki-decks/downloads/ (the
# addresses are in local/README.md); the results go to
# local/anki-decks/study-data/. Neither is in git. Run from the project
# folder, with Anki's own Python package (not one of the app's
# dependencies; tests/fixtures/anki/README.md sets it up):
#
#   local/anki-venv/bin/python -I scripts/anki-study-data.py \
#       local/anki-decks/downloads local/anki-decks/study-data
#
# How it works: each deck is imported into a fresh, empty Anki collection.
# Then a learner is simulated day by day up to now: when they study, how
# many new cards they take, which button they press. Whether they remember
# a card comes from a hidden "true memory" per card that fades with time.
# The schedule follows Anki's own rules (SM-2, learning steps of 1 and 10
# minutes); where the learner uses FSRS, Anki itself works out the card's
# memory after each answer and the interval follows from it. Every answer
# goes into Anki's review log as Anki writes it. Last come the things a
# learner does by hand (suspend, bury, flags, Forget, Set due date, a
# filtered deck), and Anki exports the collection.
#
# The same seed gives the same learners; their dates are counted back from
# now, so cards are due relative to the day the script is run.

import heapq
import math
import os
import random
import shutil
import sys
import tempfile
import time

from anki.collection import (
    Collection,
    DeckIdLimit,
    ExportAnkiPackageOptions,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)
from anki.cards import FSRSMemoryState
from anki.decks import UpdateDeckConfigs
from anki import deck_config_pb2

DAY = 86400
MINUTE = 60

# Anki's review log types.
LEARN, REVIEW, RELEARN, FILTERED, MANUAL, RESCHEDULED = 0, 1, 2, 3, 4, 5
# Anki's card types (the `type` column) and the queues used here.
NEW, LEARNING, REVIEW_CARD, RELEARNING = 0, 1, 2, 3
SUSPENDED = -1


class Learner:
    """One made-up learner studying some decks of one Anki collection."""

    def __init__(self, col, rng, *, decks, start_day, new_per_day, review_limit=200,
                 study_chance=0.85, breaks=(), session_hour=20.5, session_minutes=30,
                 grades=(0.06, 0.84, 0.10), answer_seconds=6.0, fsrs_from_day=None,
                 reschedule_on_switch=False, leech_suspend=False, desired_retention=0.9,
                 last_day=None, study_days=None):
        self.col = col
        self.rng = rng
        self.decks = decks
        self.start_day = start_day
        self.new_per_day = new_per_day
        self.review_limit = review_limit
        self.study_chance = study_chance
        self.breaks = breaks
        self.session_hour = session_hour
        self.session_minutes = session_minutes
        # How often a remembered card gets Hard, Good, Easy.
        self.hard, self.good, self.easy = grades
        self.answer_seconds = answer_seconds
        self.fsrs_from_day = fsrs_from_day
        self.reschedule_on_switch = reschedule_on_switch
        self.leech_suspend = leech_suspend
        self.desired_retention = desired_retention
        self.study_days = study_days  # a function (day, rng) -> bool, in place of study_chance
        self.today = col.sched.today
        self.last_day = self.today if last_day is None else last_day
        # The start of Anki's day number 0, in seconds since 1970 (Anki's
        # day starts at 4 in the morning; today is col.sched.today).
        self.day_zero = col.sched.day_cutoff - (self.today + 1) * DAY
        self.leeches = []
        self.cards = {}
        rows = col.db.all(
            'select c.id, c.nid, c.due, c.did, n.flds from cards c join notes n on n.id = c.nid '
            f'where c.did in ({",".join(map(str, decks))}) order by c.due')
        for cid, nid, due, did, flds in rows:
            first = flds.split('\x1f')[0]
            # How hard the card is for this learner: longer words a little
            # harder, and much variation from card to card.
            chars = sum(1 for ch in first if '㐀' <= ch <= '鿿') or 1
            h = math.exp(rng.gauss(0, 0.45)) * (1 + 0.12 * (min(chars, 4) - 1))
            self.cards[cid] = dict(id=cid, nid=nid, did=did, type=NEW, queue=0, position=due,
                                   due=0, ivl=0, factor=0, reps=0, lapses=0, step=0, h=h,
                                   true_s=0.0, last=None)
        # New cards in Anki's order: deck by deck, as the shared deck has them.
        order = sorted(self.cards.values(), key=lambda c: (decks.index(c['did']), c['position']))
        self.new_queue = [c['id'] for c in order]
        self.last_id = 0

    # ---- Time ----

    def day_of(self, t):
        return int((t - self.day_zero) // DAY)

    def moment(self, day, hour):
        """Seconds since 1970 at `hour` o'clock on Anki day `day` (past 24 is after midnight)."""
        return self.day_zero + day * DAY + (hour - 4) * 3600

    def fsrs_on(self, day):
        return self.fsrs_from_day is not None and day >= self.fsrs_from_day

    # ---- The review log ----

    def log(self, card, t, ease, ivl, last_ivl, kind, taken_ms, factor=None):
        # Anki's review IDs are the time in milliseconds, so they must differ.
        rid = max(int(t * 1000), self.last_id + 1)
        self.last_id = rid
        self.col.db.execute(
            'insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)',
            rid, card['id'], -1, ease, ivl, last_ivl, card['factor'] if factor is None else factor, taken_ms, kind)
        return rid

    def taken(self, failed):
        """How long an answer took, in milliseconds (Anki stops counting at 60 s)."""
        seconds = self.answer_seconds * math.exp(self.rng.gauss(0, 0.5)) * (1.8 if failed else 1)
        return int(min(max(seconds, 0.8), 60) * 1000)

    # ---- Intervals ----

    def fuzz(self, ivl):
        """Anki spreads intervals a little so cards don't bunch up."""
        if ivl < 2.5:
            return max(1, round(ivl))
        spread = max(1, ivl * 0.05)
        return max(1, min(36500, round(ivl + self.rng.uniform(-spread, spread))))

    def fsrs_interval(self, card):
        """The interval Anki's FSRS gives the card now, from the memory Anki
        works out of its review log (FSRS's forgetting curve, solved for the
        desired retention)."""
        memory = self.col.compute_memory_state(card['id'])
        s, decay = memory.stability, memory.decay
        factor = 0.9 ** (-1 / decay) - 1
        return self.fuzz(s / factor * (self.desired_retention ** (-1 / decay) - 1))

    # ---- Answering ----

    def grade(self, success, r=0.9):
        if not success:
            return 1
        x = self.rng.random()
        easy = self.easy * (1.6 if r > 0.95 else 1)  # Easy more often for a card well remembered
        if x < self.hard:
            return 2
        if x < self.hard + easy:
            return 4
        return 3

    def answer(self, card, t, kind=None):
        """The learner answers `card` at time t (seconds). Returns when it is
        due again within the session, or None if not today."""
        fsrs = self.fsrs_on(self.day_of(t))
        if card['type'] in (NEW, LEARNING):
            return self.answer_learning(card, t, fsrs)
        if card['type'] == RELEARNING:
            return self.answer_relearning(card, t, fsrs)
        return self.answer_review(card, t, fsrs, kind or REVIEW)

    def answer_learning(self, card, t, fsrs):
        card['type'] = LEARNING
        steps = [1, 10]
        p = min(0.97, max(0.3, 0.8 / math.sqrt(card['h']))) if card['step'] == 0 else 0.9
        success = self.rng.random() < p
        ease = self.grade(success)
        taken = self.taken(not success)
        if ease == 1:
            card['step'] = 0
            self.log(card, t, ease, -steps[0] * MINUTE, 0, LEARN, taken, factor=0)
            card['due'] = t + steps[0] * MINUTE + taken / 1000
            return card['due']
        if ease == 2:
            delay = (steps[0] + steps[1]) / 2 if card['step'] == 0 else steps[card['step']]
            self.log(card, t, ease, -int(delay * MINUTE), 0, LEARN, taken, factor=0)
            card['due'] = t + delay * MINUTE
            return card['due']
        if ease == 3 and card['step'] + 1 < len(steps):
            card['step'] += 1
            self.log(card, t, ease, -steps[card['step']] * MINUTE, 0, LEARN, taken, factor=0)
            card['due'] = t + steps[card['step']] * MINUTE
            return card['due']
        # Graduates: Anki's graduating interval is 1 day, Easy 4.
        card['factor'] = 2500
        rid = self.log(card, t, ease, 0, -steps[card['step']] * MINUTE, LEARN, taken)
        ivl = self.fsrs_interval(card) if fsrs else (4 if ease == 4 else 1)
        self.col.db.execute('update revlog set ivl = ? where id = ?', ivl, rid)
        self.to_review(card, t, ivl)
        card['true_s'] = self.rng.uniform(1.5, 4.0) / card['h'] * (2 if ease == 4 else 1)
        card['reps'] += 1
        return None

    def answer_relearning(self, card, t, fsrs):
        success = self.rng.random() < 0.88
        ease = self.grade(success)
        taken = self.taken(not success)
        if ease == 1:
            self.log(card, t, ease, -10 * MINUTE, card['ivl'], RELEARN, taken)
            card['due'] = t + 10 * MINUTE
            return card['due']
        rid = self.log(card, t, ease, 0, -10 * MINUTE, RELEARN, taken)
        ivl = self.fsrs_interval(card) if fsrs else 1
        self.col.db.execute('update revlog set ivl = ? where id = ?', ivl, rid)
        self.to_review(card, t, ivl)
        card['reps'] += 1
        return None

    def answer_review(self, card, t, fsrs, kind):
        day = self.day_of(t)
        elapsed = max(0.01, (t - card['last']) / DAY)
        r = 0.9 ** (elapsed / card['true_s'])  # the chance the learner remembers
        success = self.rng.random() < r
        ease = self.grade(success, r)
        taken = self.taken(not success)
        old = card['ivl']
        card['reps'] += 1
        if success:
            card['true_s'] = min(3650, card['true_s'] * (1 + (6 / card['h']) * (1.05 - r) ** 0.9))
        else:
            card['true_s'] = max(0.2, card['true_s'] * 0.25)
        if ease == 1:
            # A lapse: ease down 20%, ten minutes of relearning, then 1 day.
            card['lapses'] += 1
            card['factor'] = max(1300, card['factor'] - 200)
            self.log(card, t, ease, -10 * MINUTE, old, kind, taken)
            card['type'] = RELEARNING
            card['ivl'] = 1
            card['due'] = t + 10 * MINUTE
            # Anki's leech threshold: 8 lapses, then every 4 more.
            if card['lapses'] >= 8 and card['lapses'] % 4 == 0:
                if card['id'] not in self.leeches:
                    self.leeches.append(card['id'])
                if self.leech_suspend:
                    card['queue'] = SUSPENDED
                    return None
            return card['due']
        delay = max(0, day - card['due'])  # days overdue
        rid = self.log(card, t, ease, 0, old, kind, taken)
        if fsrs:
            ivl = self.fsrs_interval(card)
        else:
            f = card['factor'] / 1000
            hard = max(old + 1, old * 1.2)
            good = max(hard + 1, (old + delay / 2) * f)
            easy = max(good + 1, (old + delay) * f * 1.3)
            ivl = self.fuzz({2: hard, 3: good, 4: easy}[ease])
            card['factor'] += {2: -150, 3: 0, 4: 150}[ease]
        self.col.db.execute('update revlog set ivl = ?, factor = ? where id = ?', ivl, card['factor'], rid)
        self.to_review(card, t, ivl)
        return None

    def to_review(self, card, t, ivl):
        card.update(type=REVIEW_CARD, ivl=ivl, due=self.day_of(t) + ivl, last=t, step=0)

    # ---- A day of study ----

    def studies_on(self, day):
        if day < self.start_day or day > self.last_day:
            return False
        if any(a <= day <= b for a, b in self.breaks):
            return False
        if self.study_days:
            return self.study_days(day, self.rng)
        return self.rng.random() < self.study_chance

    def due_reviews(self, day):
        return [c for c in self.cards.values()
                if c['type'] == REVIEW_CARD and c['queue'] == 0 and c['due'] <= day]

    def session(self, day, start=None, minutes=None, new_today=None, stop_at=None, cram=None):
        """One sitting: learning cards when due, reviews with new cards mixed
        in. Ends when nothing is left, when the learner has had enough, or at
        stop_at (seconds); cards still in their steps stay in learning. With
        `cram`, those cards are studied ahead of time, as in a filtered deck."""
        t = start or self.moment(day, self.session_hour + self.rng.gauss(0, 1))
        end = t + (minutes or self.session_minutes * math.exp(self.rng.gauss(0, 0.35))) * MINUTE
        if stop_at is not None:
            end = min(end, stop_at)
        learning = [(c['due'], c['id']) for c in self.cards.values()
                    if c['type'] in (LEARNING, RELEARNING) and c['queue'] == 0]
        heapq.heapify(learning)
        if cram is not None:
            main = list(cram)
        else:
            reviews = self.due_reviews(day)
            self.rng.shuffle(reviews)
            reviews = [c['id'] for c in reviews[: self.review_limit]]
            count = self.new_per_day if new_today is None else new_today
            if len(reviews) > 0.6 * self.review_limit:
                count //= 3  # a heavy day: fewer new cards
            news = []
            while self.new_queue and len(news) < count:
                cid = self.new_queue.pop(0)
                if self.cards[cid]['queue'] == 0 and self.cards[cid]['type'] == NEW:
                    news.append(cid)
            # A new card now and then among the reviews.
            main = list(reviews)
            gap = max(1, len(reviews) // (len(news) + 1))
            for i, cid in enumerate(news):
                main.insert(min(len(main), (i + 1) * gap + i), cid)
        while t < end:
            if learning and learning[0][0] <= t:
                _, cid = heapq.heappop(learning)
            elif main:
                cid = main.pop(0)
            elif learning and learning[0][0] - t < 12 * MINUTE:
                t = learning[0][0]  # waits for the last learning cards
                continue
            else:
                break
            card = self.cards[cid]
            if card['queue'] != 0:
                continue
            ahead = cram is not None and card['type'] == REVIEW_CARD and card['due'] > day
            again = self.answer(card, t, FILTERED if ahead else None)
            t += self.taken(False) / 1000 + self.rng.uniform(1, 4)
            if again is not None:
                heapq.heappush(learning, (again, cid))
        # New cards taken out but not reached go back to the front.
        if cram is None:
            self.new_queue[:0] = [cid for cid in main if self.cards[cid]['type'] == NEW]
        return t

    def run(self, extra=None):
        """Every day from the start to the last; `extra(day)` runs first each day."""
        for day in range(self.start_day, self.last_day + 1):
            if extra:
                extra(day)
            if self.fsrs_from_day == day:
                self.switch_to_fsrs(day)
            if self.studies_on(day):
                self.session(day)

    # ---- Switching to FSRS ----

    def switch_to_fsrs(self, day):
        """As Anki does when FSRS is turned on, with "Reschedule cards on
        change" if asked: every review card gets the interval its memory
        gives, logged as "Rescheduled"."""
        enable_fsrs(self.col, self.decks[0], self.desired_retention)
        if not self.reschedule_on_switch:
            return
        t = self.moment(day, 19)
        for card in self.cards.values():
            if card['type'] == REVIEW_CARD:
                ivl = self.fsrs_interval(card)
                self.log(card, t, 0, ivl, card['ivl'], RESCHEDULED, 0)
                card['ivl'] = ivl
                card['due'] = self.day_of(card['last']) + ivl

    # ---- By hand ----

    def forget(self, cid, t):
        """Anki's Forget: the card is new again, after the other new cards."""
        card = self.cards[cid]
        self.log(card, t, 0, 0, card['ivl'], MANUAL, 0, factor=0)
        card.update(type=NEW, queue=0, ivl=0, factor=0, step=0, last=None,
                    position=max(c['position'] for c in self.cards.values()) + 1)
        self.new_queue.append(cid)

    def set_due(self, cid, t, days_from_then):
        """Anki's Set due date on a review card."""
        card = self.cards[cid]
        day = self.day_of(t) + days_from_then
        ivl = max(card['ivl'], day - self.day_of(card['last']))
        self.log(card, t, 0, ivl, card['ivl'], MANUAL, 0)
        card['ivl'] = ivl
        card['due'] = day

    # ---- Saving ----

    def save(self, now):
        """Writes the cards' schedules into the collection."""
        rows = []
        for c in self.cards.values():
            if c['type'] == NEW:
                due, left = c['position'], 0
            elif c['type'] in (LEARNING, RELEARNING):
                # Due at a moment, in seconds; `left` counts the steps to go.
                due = int(c['due'])
                steps_left = 2 - c['step'] if c['type'] == LEARNING else 1
                left = steps_left * 1000 + steps_left
            else:
                due, left = c['due'], 0
            # Here queue 0 only means "not suspended"; Anki's queue says
            # where the card is: 0 new, 1 in its steps, 2 review.
            queue = SUSPENDED if c['queue'] == SUSPENDED else {
                NEW: 0, LEARNING: 1, RELEARNING: 1, REVIEW_CARD: 2}[c['type']]
            rows.append((c['type'], queue, due, c['ivl'], c['factor'], c['reps'], c['lapses'],
                         left, now, c['id']))
        self.col.db.executemany(
            'update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, '
            'mod=?, usn=-1 where id=?', rows)
        # Anki tags a leech's note "leech".
        for cid in self.leeches:
            note = self.col.get_note(self.cards[cid]['nid'])
            if not note.has_tag('leech'):
                note.add_tag('leech')
                self.col.update_note(note)

    def store_memory(self):
        """Has Anki work out each studied card's FSRS memory and keep it with
        the card, as it does in a deck that uses FSRS."""
        for c in self.cards.values():
            if c['type'] != NEW:
                memory = self.col.compute_memory_state(c['id'])
                if memory.stability:
                    card = self.col.get_card(c['id'])
                    card.memory_state = FSRSMemoryState(stability=memory.stability, difficulty=memory.difficulty)
                    card.desired_retention = memory.desired_retention
                    self.col.update_card(card)


def enable_fsrs(col, deck_id, retention):
    """Turns on FSRS, as the switch in Anki's deck options does."""
    current = col.decks.get_deck_configs_for_update(deck_id)
    config = current.all_config[0].config
    config.config.desired_retention = retention
    col.decks.update_deck_configs(UpdateDeckConfigs(
        target_deck_id=deck_id, configs=[config],
        mode=deck_config_pb2.UpdateDeckConfigsMode.UPDATE_DECK_CONFIGS_MODE_NORMAL,
        fsrs=True, fsrs_reschedule=False, limits=current.current_deck.limits,
        new_cards_ignore_review_limit=current.new_cards_ignore_review_limit,
        apply_all_parent_limits=current.apply_all_parent_limits))


def fresh_collection(work, name, packages, days_ago):
    """An empty collection made `days_ago` days ago, with the shared decks in it."""
    folder = os.path.join(work, name)
    os.makedirs(folder)
    col = Collection(os.path.join(folder, 'collection.anki2'))
    col.db.execute('update col set crt = ?', col.crt - days_ago * DAY)
    for package in packages:
        col.import_anki_package(ImportAnkiPackageRequest(
            package_path=package,
            options=ImportAnkiPackageOptions(with_scheduling=False, with_deck_configs=False)))
    return col


def export_apkg(col, path, deck, *, legacy, media):
    col.export_anki_package(
        out_path=path,
        options=ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True,
                                         with_media=media, legacy=legacy),
        limit=DeckIdLimit(deck_id=deck))


def summary(col, label):
    reviews = col.db.scalar('select count(*) from revlog')
    by_type = dict(col.db.all('select type, count(*) from revlog group by type'))
    states = col.db.all('select type, queue, count(*) from cards group by 1, 2 order by 1, 2')
    print(f'{label}: {reviews} reviews, by log type {by_type}; cards (type, queue, count) {states}')


# ---- The learners ----

def mei(downloads, work, out, now):
    """Simplified, HSK: 10½ months, evenings, fairly steady; a summer break;
    FSRS since May with rescheduling; radicals too (Recognize, not Write)."""
    rng = random.Random(1)
    col = fresh_collection(work, 'mei', [
        os.path.join(downloads, 'Anki-xiehanzi-Old-HSK-2012.apkg'),
        os.path.join(downloads, 'Anki-xiehanzi-Kangxi-Radicals-Free.apkg'),
    ], 330)
    today = col.sched.today
    did = col.decks.id_for_name
    levels = [did(f'Anki xiehanzi::Old HSK (2012)::HSK {n}') for n in range(1, 7)]
    words = Learner(col, rng, decks=levels, start_day=today - 324, new_per_day=9,
                    study_chance=0.86, breaks=[(today - 80, today - 60)], session_hour=21,
                    fsrs_from_day=today - 160, reschedule_on_switch=True, last_day=today - 1)
    # HSK 1 to 4, then only the first 30 cards of HSK 5.
    hsk5 = [cid for cid in words.new_queue if words.cards[cid]['did'] == levels[4]]
    words.new_queue = [cid for cid in words.new_queue if words.cards[cid]['did'] in levels[:4]] + hsk5[:30]
    words.run()
    words.session(today, start=words.moment(today, 7.5), minutes=12)  # this morning, before work

    recognize = did('Anki xiehanzi::Kangxi Radicals (Free)::Recognize')
    write = did('Anki xiehanzi::Kangxi Radicals (Free)::Write')
    radicals = Learner(col, rng, decks=[recognize], start_day=today - 250, new_per_day=5,
                       study_chance=0.8, session_hour=21.7, answer_seconds=4,
                       fsrs_from_day=today - 160, last_day=today - 1, breaks=[(today - 80, today - 60)])
    radicals.run()
    # Ten days of the Write cards, slow and hard, then given up.
    writing = Learner(col, rng, decks=[write], start_day=today - 250, new_per_day=10,
                      session_hour=22, answer_seconds=15, last_day=today - 240, study_chance=1,
                      grades=(0.3, 0.65, 0.05))
    writing.run()
    for learner in (words, radicals, writing):
        learner.save(now)
    col.sched.suspend_cards(col.find_cards(f'did:{write}'))
    # Half her leeches suspended by hand.
    col.sched.suspend_cards([cid for cid in words.leeches if rng.random() < 0.5])
    # Three cards due by tomorrow buried this morning (Anki brings them back
    # at the start of the next day).
    col.sched.bury_cards(col.find_cards('deck:"Anki xiehanzi::Old HSK (2012)" is:review prop:due<=1')[:3])
    # Flags and a marked note, as a learner leaves them.
    studied = col.find_cards('deck:"Anki xiehanzi::Old HSK (2012)" -is:new')
    col.set_user_flag_for_cards(1, rng.sample(studied, 6))
    col.set_user_flag_for_cards(4, rng.sample(studied, 3))
    note = col.get_note(col.get_card(studied[0]).nid)
    note.add_tag('marked')
    col.update_note(note)
    words.store_memory()
    radicals.store_memory()
    summary(col, 'Mei')
    export_apkg(col, os.path.join(out, 'mei-hsk-fsrs.apkg'), did('Anki xiehanzi::Old HSK (2012)'),
                legacy=False, media=False)
    col.export_collection_package(os.path.join(out, 'mei-whole-collection.colpkg'),
                                  include_media=True, legacy=False)
    col.close()


def lin(downloads, work, out, now):
    """Traditional, 3000 characters: five intensive months in 2025 on SM-2,
    mornings, never Hard, leeches suspended by Anki; Forget on cards that kept
    failing; a failed comeback in January with Set due date on part of the
    backlog; nothing since."""
    rng = random.Random(2)
    col = fresh_collection(work, 'lin', [os.path.join(downloads, 'hanzi_3000.apkg')], 620)
    today = col.sched.today
    deck = col.decks.id_for_name('hanzi_3000')
    learner = Learner(col, rng, decks=[deck], start_day=today - 615, new_per_day=20,
                      study_chance=0.95, session_hour=7, session_minutes=35,
                      grades=(0.0, 0.88, 0.12), answer_seconds=5, leech_suspend=True,
                      last_day=today - 455)

    def start_over(day):
        if day == today - 500:
            t = learner.moment(day, 6.9)
            worst = sorted((c for c in learner.cards.values() if c['type'] == REVIEW_CARD and c['queue'] == 0),
                           key=lambda c: -c['lapses'])[:25]
            for c in worst:
                learner.forget(c['id'], t)

    learner.run(start_over)
    back = today - 289
    learner.last_day = back
    t = learner.session(back, start=learner.moment(back, 20), minutes=40, new_today=0)
    overdue = [c['id'] for c in learner.due_reviews(back)]
    for cid in rng.sample(overdue, min(300, len(overdue))):
        learner.set_due(cid, t + 60, rng.randint(0, 30))
    learner.save(now)
    summary(col, 'Lin')
    export_apkg(col, os.path.join(out, 'lin-hanzi3000-lapsed-legacy.apkg'), deck, legacy=True, media=False)
    col.close()


def student(downloads, work, out, now):
    """Traditional textbook (words and grammar points): FSRS from the start of
    term; only some kinds of card studied, the rest suspended; cramming before
    quizzes in a filtered deck; exported in the middle of a session."""
    rng = random.Random(3)
    col = fresh_collection(work, 'student', [os.path.join(downloads, 'Ch_book1.apkg')], 60)
    today = col.sched.today
    deck = col.decks.id_for_name('Ch_book1')
    # Studied: for words Meaning, Character and Pinyin; for grammar points
    # Explanation and Structure. Every other kind suspended.
    studied = {'zh_voc': ['Meaning', 'Character', 'Pinyin'],
               'PAVzh12gram-8c9e8': ['Explanation', 'Structure']}
    kinds = [(m['id'], t['ord']) for m in col.models.all()
             for t in m['tmpls'] if t['name'] in studied.get(m['name'], [])]
    kept = set(col.db.list(
        'select c.id from cards c join notes n on n.id = c.nid where '
        + ' or '.join(f'(n.mid = {mid} and c.ord = {ord})' for mid, ord in kinds)))
    weekday_today = time.localtime(now).tm_wday

    def class_days(day, rng):
        weekday = (day - today + weekday_today) % 7
        return rng.random() < {0: 0.9, 1: 0.8, 3: 0.85, 6: 0.6}.get(weekday, 0.1)

    learner = Learner(col, rng, decks=[deck], start_day=today - 56, new_per_day=15,
                      study_days=class_days, session_hour=16, session_minutes=25,
                      grades=(0.18, 0.72, 0.10), answer_seconds=9, fsrs_from_day=today - 56,
                      last_day=today - 1)
    for cid, card in learner.cards.items():
        if cid not in kept:
            card['queue'] = SUSPENDED
    learner.new_queue = [cid for cid in learner.new_queue if cid in kept]

    def quizzes(day):
        # A quiz every second Friday: the evening before, 40 cards not yet
        # due, crammed in a filtered deck that keeps the answers.
        if (today - day) % 14 == 8 and day > today - 50:
            ahead = [c['id'] for c in learner.cards.values()
                     if c['type'] == REVIEW_CARD and c['queue'] == 0 and c['due'] > day]
            rng.shuffle(ahead)
            learner.session(day, start=learner.moment(day, 22), minutes=30, cram=ahead[:40])

    learner.run(quizzes)
    # Now: twenty minutes into a session, interrupted by the export.
    learner.session(today, start=now - 20 * MINUTE, minutes=40, stop_at=now - 30)
    learner.save(now)
    learner.store_memory()
    # The midterm's filtered deck, still there: its cards keep their own
    # deck in `odid`.
    filtered = col.sched.get_or_create_filtered_deck(deck_id=0)
    filtered.name = 'Ch_book1 midterm review'
    filtered.config.search_terms[0].search = 'deck:"Ch_book1" is:review prop:ivl>=2'
    filtered.config.search_terms[0].limit = 50
    filtered.config.reschedule = True
    col.sched.add_or_update_filtered_deck(filtered)
    summary(col, 'Student')
    export_apkg(col, os.path.join(out, 'student-ch-book1.apkg'), deck, legacy=False, media=True)
    col.export_collection_package(os.path.join(out, 'student-whole-collection.colpkg'),
                                  include_media=False, legacy=False)
    col.close()


def main():
    downloads, out = (os.path.abspath(p) for p in sys.argv[1:3])
    os.makedirs(out, exist_ok=True)
    work = tempfile.mkdtemp(dir=os.path.dirname(out))
    now = int(time.time())
    try:
        for make in (mei, lin, student):
            make(downloads, work, out, now)
    finally:
        shutil.rmtree(work)
    print('Made in', out, ':', ', '.join(sorted(os.listdir(out))))


if __name__ == '__main__':
    main()
