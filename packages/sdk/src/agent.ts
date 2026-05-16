import type { AgentContext, AgentMeta } from './types.js';

export abstract class Agent {
  abstract readonly meta: AgentMeta;

  async onLoad(_ctx: AgentContext): Promise<void> {}

  abstract run(ctx: AgentContext): Promise<void>;

  async onUnload(_ctx: AgentContext): Promise<void> {}
}

export type AgentConstructor = new () => Agent;
