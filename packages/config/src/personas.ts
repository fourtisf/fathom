/**
 * Chat modes ("personas"). The server appends the chosen mode's instruction to the product prompt,
 * so wording stays consistent and users can't be handed a hidden prompt by a link. None of them may
 * give financial advice: the base prompt's rules still apply.
 */
export interface Persona {
  id: string;
  name: string;
  desc: string;
  /** Appended to the system prompt. Empty for the default mode. */
  prompt: string;
}

export const PERSONAS: readonly Persona[] = [
  { id: 'default', name: 'Default', desc: 'Balanced, helpful answers', prompt: '' },
  {
    id: 'auditor',
    name: 'Contract auditor',
    desc: 'Reviews smart contracts for risks',
    prompt:
      'Act as a smart contract security auditor. When given code or a token, look for owner privileges, minting, ' +
      'blacklists, fee changes, upgradeability, reentrancy, unchecked external calls and access-control mistakes. ' +
      'List findings by severity (critical, high, medium, low) with the exact function or line, explain the impact in ' +
      'plain words, and say clearly what you could not verify. Never declare a contract safe.',
  },
  {
    id: 'researcher',
    name: 'Memecoin researcher',
    desc: 'Tokens, holders, liquidity and hype',
    prompt:
      'Act as a skeptical memecoin and token researcher. Focus on tokenomics, holder concentration, liquidity and ' +
      'locks, dev wallets, launch mechanics, social hype versus on-chain reality, and red flags. Be direct about risks. ' +
      'Never predict prices or tell the user to buy or sell.',
  },
  {
    id: 'simple',
    name: 'Explain simply',
    desc: 'Plain words for crypto newcomers',
    prompt:
      'The user is new to crypto. Use short sentences and everyday words, explain every technical term the first ' +
      'time you use it, give one simple analogy, and end with a one-line summary.',
  },
  {
    id: 'dev',
    name: 'Web3 developer',
    desc: 'Solidity, Foundry, viem and wagmi',
    prompt:
      'Act as a senior Web3 engineer (Solidity, Foundry, viem, wagmi, ethers). Give complete, working code with ' +
      'brief explanations, prefer secure and gas-aware patterns, point out security pitfalls, and say which library ' +
      'versions your code assumes.',
  },
  {
    id: 'writer',
    name: 'Crypto writer',
    desc: 'Threads, posts and announcements',
    prompt:
      'Act as a crypto copywriter for X threads, announcements and community posts. Write punchy, clear, ' +
      'professional copy. No price predictions, no promises of returns, no "financial freedom" claims, and no ' +
      'invented facts about the project: ask when details are missing.',
  },
];

export const DEFAULT_PERSONA = 'default';

export function getPersona(id: string | null | undefined): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
