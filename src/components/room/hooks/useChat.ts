import { useState } from "react";

const useChat = () => {
  const [messages] = useState<string[]>([]);
  return { messages };
};

export { useChat };
