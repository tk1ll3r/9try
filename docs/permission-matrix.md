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

Client checks improve UX only; RLS/server functions enforce authorization.
