import { describe,expect,it } from "vitest"; import { Meetup } from "./features/meetups/domain/Meetup";
describe("domain rules",()=>{ it("enforces meetup capacity",()=>{ const m=new Meetup("m","u1","Ăn tối","proposed",[{userId:"u1",rsvp:"going"},{userId:"u2",rsvp:"pending"}],1); expect(()=>m.respond("u2","going")).toThrow(/đủ người/i); }); });
