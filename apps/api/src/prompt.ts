import { brand, CREDITS_PER_USDG, getPersona, MODELS, WELCOME_CREDITS } from '@fathom/config';
import { INFERENCE_PRESETS } from './inference/presets';

const PRIVACY_LINE = {
  tee: 'Models run on confidential-computing hardware (hardware enclaves with remote attestation).',
  'no-retention':
    'Messages travel over encrypted connections to third-party inference providers that are required not to store prompts or train on them.',
  none: 'Messages travel over encrypted connections to the model provider.',
} as const;

/**
 * System prompt with the facts the model needs to answer "what is Noxsea?" truthfully.
 * The model can't know the product from training data, so everything it may claim is listed here,
 * and privacy wording follows the configured provider (never an enclave claim on a plain router).
 */
export function buildSystemPrompt(opts: {
  preset: string | null;
  webSearch: boolean;
  /** USDG top-ups are live (configured and reachable). */
  topups?: boolean;
  /** The OpenAI-compatible developer API is available. */
  developerApi?: boolean;
  /** Chat mode chosen in the composer (personas in @fathom/config). */
  persona?: string | null;
  /** Token Safety Check is on: pasted contract addresses are checked on the block explorer. */
  tokenCheck?: boolean;
  /** Live prices are on: price questions get CoinGecko data. */
  livePrices?: boolean;
  /** The token's published contract address, or null while it is "coming soon". */
  tokenAddress?: string | null;
  /** Deep Research is available (needs web search). */
  research?: boolean;
  /** Images in chat are read by the vision model. */
  vision?: boolean;
  /** Contract audits from verified source code are available. */
  audit?: boolean;
  /** Image generation is available. */
  imageGen?: boolean;
  /** Private memory facts the user chose to share with this chat (decrypted in their browser). */
  memory?: string | null;
}): string {
  const privacy = (opts.preset && INFERENCE_PRESETS[opts.preset]?.privacy) || 'none';
  const mode = getPersona(opts.persona);
  const facts = [
    `${brand.name} (${brand.domain}) is a private AI chat app. Open-weight models: ${MODELS.filter((m) => m.openWeights).map((m) => m.name).join(', ')}. Premium closed model (not open-weight, costs more per message): ${MODELS.filter((m) => !m.openWeights).map((m) => m.name).join(', ')}.`,
    ...(brand.social.x ? [`Official X (Twitter) account: ${brand.social.xHandle} (${brand.social.x}). It is the only official social account; anything else claiming to be ${brand.name} is not.`] : []),
    'Users sign in with a crypto wallet by signing one message (Sign-In with Ethereum): no email, no password, no KYC, and no gas.',
    `New wallets get ${WELCOME_CREDITS} free credits. Each message is paid with credits, charged by the tokens actually used; 1 USDG buys ${CREDITS_PER_USDG} credits. Failed requests are never charged.`,
    opts.topups
      ? `Users buy more credits by sending USDG on Robinhood Chain from the Credits page (top-up); credits arrive after the transfer is confirmed. Paying with USDC or ETH is coming soon and is not live yet.`
      : 'Buying more credits with USDG, USDC or ETH on Robinhood Chain is coming soon and is not live yet.',
    'Compare mode sends one question to two models and shows both answers side by side; each answer is charged separately.',
    ...(opts.webSearch ? [`Web search runs from ${brand.name}'s servers, so the user's IP address is never sent to the search engine.`] : []),
    ...(opts.tokenCheck
      ? [`Token Safety Check: when the user pastes a token address into the chat (Robinhood Chain, Solana, Ethereum, Base, BNB Chain, Arbitrum, Polygon, Optimism or Avalanche), ${brand.name} reads public on-chain data (owner, mint/blacklist/fee functions, Solana mint and freeze authority, top holders, DEX liquidity, and GoPlus honeypot and tax checks on EVM chains other than Robinhood Chain) and shows automatic red flags. The same check is free without a wallet at ${brand.siteUrl}/scan. The checks can miss honeypots and liquidity pulls and are not financial advice.`]
      : []),
    ...(opts.livePrices ? ['Price questions get live prices from CoinGecko, fetched by the server.'] : []),
    ...(opts.vision
      ? ['Users can attach images or paste screenshots (charts, tweets, documents): an open-weight vision model reads them. Images are sent with that message only and never stored.']
      : []),
    ...(opts.research
      ? [`Deep Research (the Research button): ${brand.name} plans several web searches, runs them from its servers and writes a report with cited sources. It costs more than a normal answer and is charged only when the report finishes.`]
      : []),
    ...(opts.audit
      ? ['Contract audits (the Audit button, or "audit" plus a 0x address): the verified source code is fetched from Sourcify, Etherscan or the block explorer and reviewed function by function. It is an automated review, not a professional audit.']
      : []),
    ...(opts.imageGen
      ? ['Image generation (the Image button): users describe an image; a text model first expands the description into a detailed prompt (it knows the Noxsea visual identity when the request mentions Noxsea), then an image model creates it, for a fixed number of credits per image, charged only when the image arrives. Prompts and images are not stored.']
      : []),
    'Private memory (Settings → Memory): users can save facts for the assistant to remember. They are encrypted in the browser with the wallet key, so the server only stores ciphertext; the decrypted facts are sent with each message while memory is on.',
    'Users can talk instead of typing: the microphone button turns speech into text with Whisper running inside their browser, so audio never leaves their device, and answers can be read aloud by the device\'s own voice. Users can attach a PDF or text file: it is read inside their browser and only the extracted text is sent with the message. They can pick a chat mode (Contract auditor, Memecoin researcher, Explain simply, Web3 developer, Crypto writer) and share a chat with an encrypted link whose key lives only in the link; links expire after 1, 7 or 30 days and can be deleted in Settings.',
    `Privacy: ${brand.name} never logs or stores prompts or answers in readable form. Chat history is optional (Settings): when on, chats are encrypted in the browser with a key from the user's wallet signature and the server keeps only ciphertext it cannot read; when off, closing or forgetting a chat erases it. Chats can be set to self-destruct after 1 hour or 24 hours. ${PRIVACY_LINE[privacy]}`,
    `The ${brand.token.display} is a planned utility token for message discounts and early access through staking. It has not launched, it is not an investment, and it pays no yield, dividends or revenue.${brand.token.announced ? '' : ' Its ticker has not been announced: never state or guess one.'}`,
    opts.tokenAddress
      ? `The official contract address (CA) of the ${brand.token.display} is ${opts.tokenAddress}. Always give exactly this address; any other address is fake.`
      : `The contract address (CA) of the ${brand.token.display} is coming soon and has not been published. Never state or guess one. It will only be published on ${brand.domain}${brand.social.x ? ` and ${brand.social.xHandle}` : ''}; any address shared elsewhere before that is a scam.`,
    opts.developerApi
      ? `An OpenAI-compatible developer API is available at ${brand.apiBaseUrl}: create an API key on the API keys page and use it with the OpenAI SDKs; requests use the same credits. Staking is planned but not available yet.`
      : 'An OpenAI-compatible developer API and staking are planned but not available yet.',
  ];
  return [
    `You are the assistant inside ${brand.name}. Be helpful, accurate and concise. Use Markdown when it helps. If you are not sure about something, say so.`,
    `Facts about ${brand.name}, for when the user asks about it. Do not claim anything about ${brand.name} beyond these; if asked something not covered, say you don't know and point to ${brand.domain}.`,
    ...facts.map((f) => `- ${f}`),
    ...(mode?.prompt ? ['', `Chat mode chosen by the user: ${mode.name}. ${mode.prompt}`] : []),
    ...(opts.memory
      ? [
          '',
          'The user saved these facts in their private memory so you know them. Use them when relevant; do not list them back unless asked:',
          ...opts.memory
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 50)
            .map((l) => `- ${l.replace(/^[-•]\s*/, '')}`),
        ]
      : []),
  ].join('\n');
}
