export type Role = "user" | "assistant";

export type MessageStats = {
  model?: string;
  engine?: string;
  totalDurationMs?: number;
  evalCount?: number;
  evalDurationNs?: number;
  tokensPerSecond?: number;
  toolsUsed?: string[];
  agentsUsed?: string[];
  verified?: boolean;
  rounds?: number;
};

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  stats?: MessageStats;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};
