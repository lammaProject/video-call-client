export interface AnswerType {
  type: "chat" | "register" | "videochat";
  clients: Record<string, boolean>;
  messages: Message[];
  data?: Record<string, boolean>;
}

type Message = {
  from: string;
  to: string;
  text: string;
};
