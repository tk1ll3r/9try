import { DomainError } from "./DomainError";
export class TimeRange {
  readonly start: Date; readonly end: Date;
  constructor(start:Date,end:Date){ if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start) throw new DomainError("INVALID_TIME_RANGE","Thời gian kết thúc phải sau thời gian bắt đầu."); this.start=new Date(start); this.end=new Date(end); }
  overlaps(other:TimeRange){ return this.start < other.end && other.start < this.end; }
}