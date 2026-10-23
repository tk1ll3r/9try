export interface FeedbackMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string | null;
  senderAvatarUrl: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface FeedbackRepository {
  isRecipient(): Promise<boolean>;
  submit(message: string): Promise<void>;
  inbox(): Promise<FeedbackMessage[]>;
  markRead(id: string): Promise<void>;
}
