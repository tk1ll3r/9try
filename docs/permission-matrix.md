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
- An anonymous visitor cannot call any function in `public`.

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

Client checks improve UX only; RLS/server functions enforce authorization.
