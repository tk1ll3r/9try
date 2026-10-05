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

Client checks improve UX only; RLS/server functions enforce authorization.
