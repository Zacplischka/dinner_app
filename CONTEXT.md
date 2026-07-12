# Dinder

Ephemeral group dinner decision-making: a host opens a short-lived Session, friends join with a code, everyone swipes on nearby Restaurants, and the overlap becomes the group's Match.

## Language

### Session flow

**Session**:
A short-lived shared decision room identified by a Session Code, holding at most four Participants. Expires automatically after inactivity; nothing about it persists afterward.
_Avoid_: room, game, lobby

**Session Code**:
The short shareable code participants use to join a Session.
_Avoid_: session id, PIN

**Participant**:
A person inside a Session, including the Host.
_Avoid_: user, player, member

**Host**:
The Participant who created the Session.
_Avoid_: owner, creator

**Restaurant**:
A nearby dining option fetched for the Session that Participants swipe on.
_Avoid_: option, card, place (except in external-API contexts)

**Selection**:
A single Restaurant a Participant swiped yes on.
_Avoid_: like, vote, pick

**Submission**:
A Participant's declaration that they are done selecting. A Submission may contain zero Selections — having submitted is a fact about the Participant, not about how many Selections they made.
_Avoid_: inferring "submitted" from a non-empty Selection set

**Match**:
The set of Restaurants every current Participant selected, computed once all current Participants have a Submission — including when the last unsubmitted Participant leaves. May be empty.
_Avoid_: results, overlap, winners

**SessionStore**:
The sole keeper of everything a live Session remembers — Participants, Selections, Submissions, Restaurants, the Match, and the Session's remaining lifetime. All session state enters and leaves through it.
_Avoid_: models, repository, DAO

**Restart**:
Wiping all Selections, Submissions, and the Match of a Session so the same Participants can decide again.
_Avoid_: reset, replay

**Leave**:
A Participant's deliberate exit from a Session. They are removed and no longer count as current — leaving can therefore complete the Session for those remaining.
_Avoid_: disconnect, drop

**Disconnect**:
A Participant's connection dropping without them leaving. They remain a current Participant — the Match still waits on their Submission.
_Avoid_: leave, timeout

### Social

**Profile**:
A persistent account with a display name and avatar. Required for social features; NOT required to be a Participant — guests join Sessions with just a display name.
_Avoid_: user, account

**Friendship**:
The relationship between two Profiles. Exactly one of: pending, accepted, blocked.
_Avoid_: connection

**Friend**:
A Profile whose Friendship with you is accepted. A pending Friendship is a Friend Request, never a "pending friend".
_Avoid_: contact (the shared `Friend` type's `pending` status is legacy naming)

**Friend Request**:
A Friendship still in pending, seen from either side.
_Avoid_: invite (that word is reserved for Session Invites)

**Session Invite**:
A Profile inviting a Friend into a specific Session. One of: pending, accepted, declined, expired.
_Avoid_: friend request, invitation
