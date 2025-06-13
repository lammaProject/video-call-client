export interface AnswerType {
  type: "chat" | "register" | "videoChat";
  clients: Record<string, boolean>;
  messages: Message[];
}

type Message = {
  from: string;
  to: string;
  text: string;
};
