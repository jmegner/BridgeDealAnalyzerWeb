# Technique recognition (analysis version 3)

DDS establishes optimal trick counts. The unchanged detectors inspect up to 12 concrete, legal continuations for each available opening-lead suit. Leads use best defense within their suit, and every subsequent move is optimal for the resulting position. The app retains one replay per suit with more distinct technique types while preserving types found in that search’s original line. All displayed evidence belongs to the selected suit’s replay. These detectors are not an exhaustive taxonomy, a proof of necessity, or a claim that a human can find the line without seeing all cards.

Each finding stores zero-based card positions `start`/`end` (end exclusive), involved suits, title, explanation and evidence positions. Positions describe the state **before** the named card. Tricks start at 0, 4, 8, …, 48. The original deal plus the 52 chosen cards reconstruct the replay.

## Squeeze

A simple cashing squeeze on a declaring-side winner, with the defender unable to follow suit. In a trump contract, all defensive trumps must already be gone.

For each legal discard, compare top-down cashing winners in that suit before and after discarding. Defenders follow low to retain their high guards. This recognizes singleton guards and length guards such as Kx against AQ. Every available discard must release a previously guarded card, across at least two suits. A threat in the opposite declaring hand needs a potential entry. In the actual continuation, a card released by the chosen discard must win a later trick in its own suit, without ruffing.

Entry and suit checks are structural heuristics. Alternative discards are not each subjected to a new full continuation search; only the recorded branch must show the promoted winner cashed. This excludes idle discards but does not prove a unique or necessary squeeze. Many double, compound, trump, entry, strip and positional variants are outside coverage. Releasing a guard earlier can hide the squeeze.

## Elimination / endplay

A declaring-side lead is won by a defender. Every remaining lead by that defender must be structurally either a side suit void in both declaring hands, permitting a ruff and discard, or a low card led toward a declaring-side tenace over the other defender, with the tenace in fourth seat.

At least one suit must have been actively cleared by earlier declaring-side leads. Clearing trumps means the defensive trumps are exhausted; clearing a side suit means it is exhausted in both declaring hands or in the defender who is thrown in. The actual next trick must be won by the declaring side. For a ruff-and-discard, the trick must contain a winning ruff and a discard below a remaining defensive card in its suit.

This covers recognizable strip-and-throw-in shapes. It does not handle every tenace arrangement, all notrump endplays or delayed concessions. The cleared suits are observed setup suits, not a claim that each must be eliminated in every successful strategy.

## Trump coup

A declaring-side hand with no trumps leads a side suit, immediately followed by a defender who has only trumps. The other declaring hand has the same number of trumps, a defensive trump rank lies between two of its ranks, and it wins the trick by overruffing. Earlier winning ruffs in that hand are noted as possible shortening preparation.

Ordinary overruffs without an interleaved trump holding are excluded. More elaborate grand coups, coups en passant, smother plays and other trump endings are outside coverage.

## Dummy reversal

Declarer starts with at least as many trumps as dummy and takes enough winning ruffs to reverse the length relationship. Later dummy has more remaining trumps than declarer and wins a trump-led trick that draws a defensive trump. Total tricks won with trumps must exceed declarer's original trump length.

This is stricter than counting long-hand ruffs. Equal-length starts are eligible. An ending where dummy never needs to draw another defensive trump can be missed.

## Crossruff

Each declaring hand wins at least two ruffs, and the sequence of winning ruffs changes hands at least three times. The partnership must win more total trump tricks than the original longer holding. The finding identifies suits ruffed and the corresponding tricks.

Single ruffs in each hand, short endings and lines failing the extra-trump-trick check are not labeled. Multiple techniques can appear in one line.

## Boundaries

- No label is inferred solely from the initial distribution or final trick count.
- Each available opening-lead suit is studied using its best defensive leads, even when that suit concedes tricks compared with the overall optimal lead. Every later move preserves the result after that lead; detectors do not select subsequent losing moves to demonstrate a technique.
- The search tries at most 12 deterministic continuations per available lead suit (at most 48 total), including alternative best leads in that suit and declarer tie preferences; it is not exhaustive. The default replay remains optimal against unrestricted best defense. Each suit’s findings belong only to its own replay.
- Par remains the default. The optional PBN-contract mode analyzes its supplied contract/declarer with optimal play and keeps its score separate from par.
- “No technique identified” is not “no technique exists.”
- All findings have explanations and replay jump points, not numeric confidence scores or necessity claims.
