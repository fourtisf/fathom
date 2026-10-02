import type { FastifyPluginAsync } from 'fastify';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { fixedWindow } from '../ratelimit';
import { chargeUsage, toCredits } from '../billing';
import { ImageGenError, IMAGE_SIZES, type ImageSize } from '../images';

/**
 * POST /images: generate one image from a prompt. Charged a fixed number of credits, only after the
 * image arrived. The prompt and the image are never logged or stored.
 */
export const IMAGE_RATE_PER_MIN = 6;
const MAX_PROMPT = 1000;

export const imageRoutes: FastifyPluginAsync = async (app) => {
  app.post('/images', { preHandler: requireAuth }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const gen = app.ctx.images;
    if (!gen) return reply.status(503).send(errorBody(503, 'Image generation is not available right now. You were not charged.', 'images_unavailable'));
    const userId = request.userId!;
    const b = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
    const size = (typeof b.size === 'string' && b.size in IMAGE_SIZES ? b.size : 'square') as ImageSize;
    if (prompt.length < 3 || prompt.length > MAX_PROMPT) {
      return reply.status(400).send(errorBody(400, `Describe the image in 3 to ${MAX_PROMPT} characters.`, 'invalid_prompt'));
    }

    const rl = await fixedWindow(app.ctx.redis, `img:${userId}`, IMAGE_RATE_PER_MIN, 60);
    if (!rl.ok) {
      return reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many images. Try again in a moment.', 'rate_limited'));
    }
    const user = await app.ctx.prisma.user.findUnique({ where: { id: userId }, select: { creditsMicro: true } });
    if (!user || user.creditsMicro < gen.costMicro) {
      const e = errorBody(402, 'Not enough credits. Top up to continue. You were not charged.', 'insufficient_credits');
      return reply.status(402).send({ error: { ...e.error, needed: toCredits(gen.costMicro), balance: toCredits(user?.creditsMicro ?? 0n) } });
    }

    const ac = new AbortController();
    request.raw.on('close', () => {
      if (!reply.sent) ac.abort(new Error('client disconnected'));
    });
    let image;
    try {
      image = await gen.generate(prompt, size, ac.signal);
    } catch (err) {
      if (ac.signal.aborted) return reply;
      const code = err instanceof ImageGenError ? err.code : 'provider_error';
      request.log.warn({ err, code }, 'image generation failed');
      return reply
        .status(code === 'rejected' ? 422 : 502)
        .send(
          errorBody(
            code === 'rejected' ? 422 : 502,
            code === 'rejected'
              ? 'The image model refused this prompt. Try describing it differently. You were not charged.'
              : "The image didn't come through. Try again. You were not charged.",
            code === 'rejected' ? 'prompt_rejected' : 'image_failed',
          ),
        );
    }
    let charged = 0n;
    try {
      charged = await chargeUsage(app.ctx.prisma, userId, 'image-generation', gen.costMicro);
    } catch (err) {
      request.log.error({ err }, 'image charge failed');
    }
    const after = await app.ctx.prisma.user.findUnique({ where: { id: userId }, select: { creditsMicro: true } });
    return { image: `data:${image.mime};base64,${image.base64}`, size, credits: toCredits(charged), balance: toCredits(after?.creditsMicro ?? 0n) };
  });
};
