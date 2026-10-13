import { describe, expect, it } from "vitest";
import { chooseForImport, decodeCalendar, parseIcs } from "./ics";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const event = (props: string) => `BEGIN:VEVENT\r\n${props}END:VEVENT\r\n`;
// Friday 9 October 2026, 10:00 in Ho Chi Minh City. 5 October 2026 is a Monday.
const reader = { zone: "Asia/Ho_Chi_Minh", now: new Date("2026-10-09T03:00:00Z") };
const read = (body: string, options = reader) => parseIcs(wrap(body), options);

const saigon = "BEGIN:VTIMEZONE\r\nTZID:Asia/Ho_Chi_Minh\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0700\r\nTZOFFSETTO:+0700\r\nTZNAME:+07\r\nDTSTART:19700101T000000\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";

describe("reading single events", () => {
  it("reads UTC times and a title folded over two lines", () => {
    const result = read(event("UID:one\r\nSUMMARY:Buoi hoc dai \r\n tiep\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\n"));
    expect(result.events).toEqual([{ uid: "one", title: "Buoi hoc dai tiep", place: "", kind: "timed", start: "2026-10-05T08:00:00Z", end: "2026-10-05T09:00:00Z",
      timezone: "Asia/Ho_Chi_Minh", repeat: null, expanded: false, ended: true }]);
  });
  it("takes a time without a zone as wall-clock time where the reader is", () => {
    expect(read(event("UID:floating\r\nSUMMARY:Hoc\r\nDTSTART:20261012T080000\r\nDTEND:20261012T090000\r\n")).events[0])
      .toMatchObject({ kind: "timed", start: "2026-10-12T01:00:00Z", end: "2026-10-12T02:00:00Z", ended: false });
  });
  it("turns the day after the last day into the last day", () => {
    expect(read(event("UID:trip\r\nSUMMARY:Du lich\r\nDTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261007\r\n")).events[0])
      .toMatchObject({ kind: "all_day", start: "2026-10-05", end: "2026-10-06" });
  });
  it("gives a moment half an hour, a date one day, and an untitled event a name", () => {
    const result = read(event("UID:deadline\r\nDTSTART:20261020T100000Z\r\n") + event("UID:day\r\nSUMMARY:Nghi\r\nDTSTART;VALUE=DATE:20261101\r\n"));
    expect(result.events).toMatchObject([
      { uid: "deadline", title: "(Không có tên)", start: "2026-10-20T10:00:00Z", end: "2026-10-20T10:30:00Z" },
      { uid: "day", kind: "all_day", start: "2026-11-01", end: "2026-11-01" },
    ]);
  });
  it("uses the zone the file defines, also under a name only Windows knows", () => {
    const outlook = "BEGIN:VTIMEZONE\r\nTZID:SE Asia Standard Time\r\nBEGIN:STANDARD\r\nDTSTART:16010101T000000\r\nTZOFFSETFROM:+0700\r\nTZOFFSETTO:+0700\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";
    const result = read(outlook + event("UID:040000008200E00074C5B7101A82E008\r\nSUMMARY:Họp nhóm\r\nLOCATION:Phòng B4.14\r\nDTSTART;TZID=\"SE Asia Standard Time\":20261012T140000\r\nDTEND;TZID=\"SE Asia Standard Time\":20261012T150000\r\n"),
      { ...reader, zone: "UTC" });
    expect(result.events[0]).toMatchObject({ title: "Họp nhóm", place: "Phòng B4.14", start: "2026-10-12T07:00:00Z", end: "2026-10-12T08:00:00Z", timezone: "UTC" });
  });
  it("leaves out what was cancelled and what is in the file twice, and says how many", () => {
    const normal = event("UID:one\r\nSUMMARY:Mot\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\n");
    const cancelled = event("UID:three\r\nSUMMARY:Huy\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\nSTATUS:CANCELLED\r\n");
    expect(read(normal + normal + cancelled)).toMatchObject({ skipped: { cancelled: 1, duplicate: 1, unreadable: 0 }, events: [{ uid: "one" }] });
  });
});

describe("reading series", () => {
  it("stores a weekly class as one repeating event with its skipped and changed dates, as Google exports it", () => {
    const result = read(saigon
      + event("UID:class@google.com\r\nSUMMARY:Cấu trúc dữ liệu\r\nLOCATION:B1.02\r\nDTSTART;TZID=Asia/Ho_Chi_Minh:20260907T073000\r\nDTEND;TZID=Asia/Ho_Chi_Minh:20260907T093000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261228T165959Z;BYDAY=MO\r\nEXDATE;TZID=Asia/Ho_Chi_Minh:20260921T073000\r\n")
      + event("UID:class@google.com\r\nRECURRENCE-ID;TZID=Asia/Ho_Chi_Minh:20261005T073000\r\nSUMMARY:Cấu trúc dữ liệu (học bù)\r\nDTSTART;TZID=Asia/Ho_Chi_Minh:20261006T130000\r\nDTEND;TZID=Asia/Ho_Chi_Minh:20261006T150000\r\n"));
    expect(result.events).toEqual([{
      uid: "class@google.com", title: "Cấu trúc dữ liệu", place: "B1.02", kind: "timed", start: "2026-09-07T00:30:00Z", end: "2026-09-07T02:30:00Z",
      timezone: "Asia/Ho_Chi_Minh", expanded: false, ended: false,
      repeat: { rule: "weekly", until: "2026-12-28", exceptions: [
        { date: "2026-09-21", canceled: true },
        { date: "2026-10-05", canceled: false, title: "Cấu trúc dữ liệu (học bù)", start: "2026-10-06T06:00:00Z", end: "2026-10-06T08:00:00Z" },
      ] },
    }]);
    expect(result.expandedSeries).toBe(0);
  });
  it("splits a weekly series on two weekdays into one per weekday, each with its own skipped dates", () => {
    const result = read(event("UID:tt1\r\nSUMMARY:Toán rời rạc\r\nDTSTART:20260907T130000\r\nDTEND:20260907T151500\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000\r\nEXDATE:20260916T130000\r\n"));
    expect(result.events).toMatchObject([
      { uid: "tt1#MO", start: "2026-09-07T06:00:00Z", end: "2026-09-07T08:15:00Z", repeat: { rule: "weekly", until: "2026-12-31", exceptions: [] } },
      { uid: "tt1#WE", start: "2026-09-09T06:00:00Z", end: "2026-09-09T08:15:00Z", repeat: { rule: "weekly", until: "2026-12-31", exceptions: [{ date: "2026-09-16", canceled: true }] } },
    ]);
  });
  it("turns a count into the day of the last time", () => {
    expect(read(event("UID:five\r\nSUMMARY:Chay bo\r\nDTSTART:20261010T090000Z\r\nDTEND:20261010T100000Z\r\nRRULE:FREQ=DAILY;COUNT=5\r\n")).events[0])
      .toMatchObject({ uid: "five", repeat: { rule: "daily", until: "2026-10-14", exceptions: [] }, ended: false });
  });
  it("marks a series whose last day has passed as over", () => {
    expect(read(event("UID:old\r\nSUMMARY:Ky truoc\r\nDTSTART:20260105T010000Z\r\nDTEND:20260105T020000Z\r\nRRULE:FREQ=WEEKLY;UNTIL=20260601T000000Z\r\n")).events[0])
      .toMatchObject({ ended: true, repeat: { until: "2026-06-01" } });
  });
  it("keeps an all-day monthly series as one event", () => {
    expect(read(event("UID:rent\r\nSUMMARY:Tien nha\r\nDTSTART;VALUE=DATE:20260905\r\nRRULE:FREQ=MONTHLY\r\n")).events[0])
      .toMatchObject({ kind: "all_day", start: "2026-09-05", end: "2026-09-05", repeat: { rule: "monthly", until: null }, ended: false });
  });
  it("reads every second week as dated events, since the app has no such repeat", () => {
    const result = read(event("UID:bi\r\nSUMMARY:Hop cach tuan\r\nDTSTART:20261001T020000Z\r\nDTEND:20261001T030000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4\r\n"));
    expect(result.events.map(item => [item.uid, item.start, item.expanded, item.repeat])).toEqual([
      ["bi#2026-10-01", "2026-10-01T02:00:00Z", true, null], ["bi#2026-10-15", "2026-10-15T02:00:00Z", true, null],
      ["bi#2026-10-29", "2026-10-29T02:00:00Z", true, null], ["bi#2026-11-12", "2026-11-12T02:00:00Z", true, null],
    ]);
    expect(result.expandedSeries).toBe(1);
  });
  it("reads a yearly birthday as the one time it happens in the coming year", () => {
    expect(read(event("UID:bday\r\nSUMMARY:Sinh nhat Kha\r\nDTSTART;VALUE=DATE:20200315\r\nRRULE:FREQ=YEARLY\r\n")).events)
      .toMatchObject([{ uid: "bday#2027-03-15", kind: "all_day", start: "2027-03-15", end: "2027-03-15", expanded: true }]);
  });
  it("reads a monthly event of the 31st time by time, because a file skips the short months", () => {
    const result = read(event("UID:last\r\nSUMMARY:Chot so\r\nDTSTART:20260131T020000Z\r\nDTEND:20260131T030000Z\r\nRRULE:FREQ=MONTHLY\r\n"));
    expect(result.events.map(item => item.start.slice(0, 10))).toEqual(["2026-10-31", "2026-12-31", "2027-01-31", "2027-03-31", "2027-05-31", "2027-07-31", "2027-08-31"]);
  });
  it("takes a changed date whose series is not in the file as an event of its own", () => {
    expect(read(event("UID:invite\r\nRECURRENCE-ID:20261013T020000Z\r\nSUMMARY:Mot buoi duoc moi\r\nDTSTART:20261013T030000Z\r\nDTEND:20261013T040000Z\r\n")).events)
      .toMatchObject([{ uid: "invite#2026-10-13", title: "Mot buoi duoc moi", repeat: null }]);
  });
});

describe("files that are not as they should be", () => {
  it("reads the rest of a file when one event in it cannot be read, and says where that one begins", () => {
    const good = (uid: string) => event(`UID:${uid}\r\nSUMMARY:Tot\r\nDTSTART:20261012T080000Z\r\nDTEND:20261012T090000Z\r\n`);
    const text = wrap(good("a") + event("UID:bad\r\nSUMMARY:Hong\r\nTHIS LINE HAS NO VALUE\r\nDTSTART:20261012T080000Z\r\n") + good("b"));
    const result = parseIcs(text, reader);
    expect(result.events.map(item => item.uid)).toEqual(["a", "b"]);
    expect(result.skipped.unreadable).toBe(1);
    expect(result.unreadableLines).toEqual([text.split("\r\n").findIndex((line, index, lines) => line === "BEGIN:VEVENT" && lines[index + 1] === "UID:bad") + 1]);
  });
  it("refuses what is not a calendar, what is too large, and more events than it reads", () => {
    expect(() => parseIcs("bad")).toThrow(/không phải file lịch/);
    expect(() => parseIcs(wrap("X".repeat(5_000_001)))).toThrow(/5 MB/);
    const many = Array.from({ length: 5001 }, (_, index) => event(`UID:e${index}\r\nSUMMARY:S\r\nDTSTART:20261012T080000Z\r\n`)).join("");
    expect(() => read(many)).toThrow(/hơn 5.000 sự kiện/);
  });
  it("decodes UTF-16 with and without a mark, and tells a .zip apart", () => {
    const text = wrap(event("UID:u16\r\nSUMMARY:Họp\r\nDTSTART:20261012T080000Z\r\n"));
    const utf16 = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index++) { utf16[index * 2] = text.charCodeAt(index) & 255; utf16[index * 2 + 1] = text.charCodeAt(index) >> 8; }
    expect(parseIcs(decodeCalendar(new Uint8Array([0xff, 0xfe, ...utf16])), reader).events[0]).toMatchObject({ uid: "u16", title: "Họp" });
    expect(parseIcs(decodeCalendar(utf16), reader).events[0]).toMatchObject({ uid: "u16", title: "Họp" });
    expect(parseIcs(decodeCalendar(new TextEncoder().encode(`﻿${text}`)), reader).events).toHaveLength(1);
    expect(() => decodeCalendar(new Uint8Array([0x50, 0x4b, 3, 4, 20, 0]))).toThrow(/\.zip/);
    expect(() => decodeCalendar(new Uint8Array(5_000_001))).toThrow(/5 MB/);
  });
});

describe("choosing what to store", () => {
  const many = (count: number) => read(Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.UTC(2026, 9, 9, 3) + (index - 300) * 86_400_000).toISOString().replace(/[-:]|\.\d+/g, "");
    return event(`UID:e${index}\r\nSUMMARY:S${index}\r\nDTSTART:${at}\r\nDTEND:${at.replace("T03", "T04")}\r\n`);
  }).join(""));
  it("leaves out what is over when asked, and counts it", () => {
    const file = many(400);
    expect(chooseForImport(file, { skipEnded: true, now: reader.now })).toMatchObject({ ended: 300, overLimit: 0 });
    expect(chooseForImport(file, { skipEnded: true, now: reader.now }).chosen).toHaveLength(100);
    expect(chooseForImport(file, { skipEnded: false, now: reader.now }).chosen).toHaveLength(400);
  });
  it("keeps the thousand nearest to now when there are more, in order of time", () => {
    const picked = chooseForImport(many(1500), { skipEnded: false, now: reader.now });
    expect(picked).toMatchObject({ ended: 0, overLimit: 500 });
    expect(picked.chosen).toHaveLength(1000);
    // 300 days back, then forward: the farthest future days are the ones left out.
    expect(picked.chosen[0].uid).toBe("e0");
    expect(picked.chosen.at(-1)!.uid).toBe("e999");
  });
  it("counts a series that still runs as now, however long ago it began", () => {
    const file = read(event("UID:old-series\r\nSUMMARY:Lop\r\nDTSTART:20240101T010000Z\r\nDTEND:20240101T020000Z\r\nRRULE:FREQ=WEEKLY\r\n")
      + event("UID:soon\r\nSUMMARY:S\r\nDTSTART:20261010T010000Z\r\nDTEND:20261010T020000Z\r\n") + event("UID:later\r\nSUMMARY:S\r\nDTSTART:20261110T010000Z\r\nDTEND:20261110T020000Z\r\n"));
    expect(chooseForImport(file, { skipEnded: true, now: reader.now, limit: 2 }).chosen.map(item => item.uid)).toEqual(["old-series", "soon"]);
  });
});
