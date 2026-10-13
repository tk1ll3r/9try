# Permission matrix

| Resource/action | Owner | Admin | Member/invitee | Other |
|---|---:|---:|---:|---:|
| Read group | yes | yes | yes | no |
| Edit group | yes | yes | no | no |
| Transfer ownership | yes | no | no | no |
| Remove owner | only after transfer | no | no | no |
| RSVP/vote | if invited | if invited | if invited | no |
| Read private event/task/note | self only | self only | self only | no |
| Read free/busy | explicit share only | explicit share only | explicit share only | no |
| Read live location | self | explicit recipient | explicit recipient | no |
| Stop location session | self | no | no | no |

Since migration 0015:

- Location can be shared only with friends.
- A meetup invitation reaches friends of the organizer or members of the meetup's group.
- Unfriending or blocking ends availability, location and event shares between the two users.
- An anonymous visitor can call only `get_public_site_metrics()` and `record_public_landing_view()`. They return aggregate counts and cannot read profile or counter rows.

Since migrations 0017–0028:

| Resource/action | Who |
|---|---|
| Become friends through an invite link | Anyone signed in who opens the link, except its owner and anyone blocked either way. A new link cancels the old one |
| Send in a direct conversation | The two people in it, while they are friends and neither has blocked the other |
| Read a direct conversation | The two people in it. After a block it leaves both conversation lists; the messages already sent stay readable to those two |
| Read or send in a group conversation | Current members of the group |
| Start a location share | The owner, to accepted friends only |
| Ask a friend for their location | Accepted friends. It sends a notification and shares nothing |
| Read busy times, including repeats | Friends or groups the owner shares availability with |
| See who is invited to a meetup | The organizer and the invitees |
| Change a member's role | The group's owner |
| Uncheck a habit, create or revoke a calendar feed | The owner |
| Read a calendar through its feed address | Anyone who has the address. Only a hash of its token is stored, and revoking or renewing it closes the old address |
| Pin a friend, see one's own pins | The user, for accepted friends only. Nobody else can read a pin. Unfriending or blocking removes pins in both directions |
| Learn whether someone is in a group | That person, and members of the group |
| Listen to a user's realtime channel | That user. Only database triggers write to it |

Since migrations 0031–0037:

| Resource/action | Who |
|---|---|
| Read a meetup, its invitees, time options, votes and comments | The organizer and the invitees. Before 0031 these reads failed for everyone on a real database |
| See a friend's profile card | Accepted friends. The introduction unless its owner keeps it private; the birthday only if its owner shows it, as day and month. No row for a stranger, an ex-friend or a blocked person |
| See that someone has the app open, or when they last had | Nobody by default. The friends, or the chosen friends, of a person who turned it on. "Last active" only if they also allow that. Turning it off, unfriending or blocking ends it on the next read |
| Ask to see a friend's schedule | An accepted friend, once while a request is pending, again a week after a refusal, 20 requests a day at most |
| Read a friend's schedule after a request | The asker, after the owner accepted: busy times by default, names only if the owner chose that, inside the days the owner chose and until the grant's end. The owner ends it at any time |
| Receive a push | The person's own devices, for the categories they left on, outside their quiet hours, and only if they may still see the thing when the push is sent. With private previews the push names nobody |
| Send a test push | The signed-in user, to their own devices |
| Use the expense ledger | The one account that holds the `couple_expenses` grant, by user id. The partner in the ledger is a name, not an account, and has no access. Nobody else gets a row or a function to run |
| Give or take back a capability | Whoever can run SQL as the database owner. No client can |
| Open a room on a meetup, an event or a mode | The organizer, the event's owner, the person whose mode it is |
| Join, read and write in a room | The people the thing is shown to (invitees, the friends or group an event is shared with, friends who can see the mode), after joining, until the room closes. Someone the owner took out cannot come back |
| Close a room, take someone out | Its owner |
| Read a closed room | Its members, for seven days. Then the database deletes it |

Since migrations 0039–0044:

| Resource/action | Who |
|---|---|
| Import an .ics file | The signed-in user, into their own calendar, 1,000 events a call. Every imported event is private |
| Post a photo of the day | The signed-in user, with no per-day count limit, to all friends or to chosen accepted friends. A list of chosen people is never widened: an empty one is for nobody |
| See a live photo and its file | Its owner, and an accepted friend who is not blocked and is in the photo's audience, for 24 hours from posting |
| See an archived photo and its file | Its owner, and an accepted friend who is not blocked and was in the photo's original audience. The archive entry remains until its owner deletes it or deletes their account |
| React to a photo, be counted as having looked | Whoever may see it |
| See who looked at a photo and who reacted | Its owner |
| Delete a photo from story and archive | Its owner |
| Read a note | Its owner, or a person/group member with an explicit active share grant |
| Edit a shared note | Its owner, or a person/group member with an explicit `edit` grant |
| Share or revoke a note, delete a note | Its owner only |
| Reply, react, search and mute in a conversation | Its participants. A reply stays inside its conversation. A closed room refuses all of it. The search finds text whether or not it was typed with its Vietnamese marks |
| Edit a message | Its sender, the text only, within 15 minutes |
| Unsend a message | Its sender at any time. In a group conversation also the group's owner and admins, in a room also the room's owner |
| Send a photo in a message | A participant of the conversation, six photos a message |
| Read a photo of a message | A participant of the conversation, while the message names the photo. When the message is taken back the photo is refused at once, before its file is removed. Whoever added a file reads it either way |
| Hear that someone is typing, say so | The participants of that conversation. Nothing of it is stored |
| Remove stored files that have no row any more | The push worker, with the service key. No client can list them |

Since migration 0050:

| Resource/action | Who |
|---|---|
| Read the public member and landing-page visit totals | Anyone, through two aggregate functions only. The counter table and profile rows are not readable through the API |
| Record a public landing-page opening | Anonymous visitors, through an atomic counter function. One call represents one landing-page opening |

Expense books, since migration 0043:

| Action | Owner | Editor | Viewer | Invited, not answered | Anyone else |
|---|---|---|---|---|---|
| Create a book | Needs the capability `couple_expenses` | No | No | No | No |
| See expenses, balances, statistics and history; export CSV | Yes | Yes | Yes | Sees the book's name and who invited them | No |
| Add an expense or a repayment | Yes | Yes | No | No | No |
| Change or delete an entry | Any entry | Their own entries | No | No | No |
| Add and delete categories and outings | Yes | Yes | No | No | No |
| Invite, remove, change roles; rename the people of the book; delete the book | Yes | No | No | No | No |
| Leave the book | Deletes it instead | Yes | Yes | Declines | Not applicable |

- The capability is given and taken back by whoever runs SQL as the database owner (`private.grant_feature`, `private.revoke_feature`). While the owner of a book does not hold it, the book is hidden from everyone in it.
- A book between friends: the owner invites accepted friends, and each has to accept. Unfriending or blocking the owner ends the membership. The person's name and entries stay in the book.
- A book of a group: created by a capability holder who is in that group, one book a group. Every member of the group is in the book as editor or as viewer, by the book's setting, and whoever joins or leaves the group joins or leaves the book.
- A name in a book gives nobody access. A membership does, and the owner can attach an invited friend to a name that exists, so that what the name paid before becomes theirs.
- When the owner's account is deleted, the owner's books are deleted for everyone in them. The settings screen says so above the delete button.

Client checks improve UX only; RLS/server functions enforce authorization.
