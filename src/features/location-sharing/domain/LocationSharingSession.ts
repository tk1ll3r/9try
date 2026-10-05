import type { Clock } from "../../../shared/domain/Clock"; import { DomainError } from "../../../shared/domain/DomainError";
export class LocationSharingSession {
  private stoppedAt?:Date;
  constructor(readonly id:string,readonly ownerId:string,readonly recipientIds:readonly string[],readonly expiresAt:Date){ if(recipientIds.length===0) throw new DomainError("RECIPIENT_REQUIRED","Hãy chọn người nhận."); }
  isActive(clock:Clock){ return !this.stoppedAt && this.expiresAt>clock.now(); }
  stop(actorId:string,clock:Clock){ if(actorId!==this.ownerId) throw new DomainError("OWNER_REQUIRED","Chỉ người chia sẻ mới được dừng."); this.stoppedAt ??= clock.now(); }
}