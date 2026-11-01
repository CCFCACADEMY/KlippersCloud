/**
 * AI-powered hairstyle recommendations.
 * Uses Claude (Anthropic Messages API, structured JSON output) when
 * ANTHROPIC_API_KEY is configured; otherwise falls back to a deterministic
 * rule-based stylist so the feature always works.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { env } from '../config/env.js';

const RecommendationSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.object({
    style: z.string(),
    why: z.string(),
    maintenance: z.enum(['low', 'medium', 'high']),
    suggested_services: z.array(z.string()),
    barber_instructions: z.string(),
  })),
  products: z.array(z.string()),
});

const client = env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;

// ---- Rule-based fallback --------------------------------------------------------
const LIBRARY = {
  oval:    ['Textured Quiff', 'Classic Pompadour', 'Buzz Cut', 'Side Part'],
  round:   ['High Fade with Volume on Top', 'Faux Hawk', 'Angular Fringe', 'Undercut'],
  square:  ['Crew Cut', 'Ivy League', 'Slick Back', 'Textured Crop'],
  oblong:  ['Fringe Crop', 'Side-Swept Medium Length', 'Classic Taper', 'Caesar Cut'],
  heart:   ['Medium Fringe', 'Side Part with Low Taper', 'Textured Mid-Length', 'Messy Crop'],
  diamond: ['Fringe Up', 'Tousled Medium Length', 'Taper Fade with Fringe', 'Swept Back'],
};
const MAINT = { 'Buzz Cut': 'low', 'Crew Cut': 'low', 'Caesar Cut': 'low', 'Classic Pompadour': 'high', 'Slick Back': 'high' };

function ruleBased(p) {
  const shape = LIBRARY[p.faceShape] ? p.faceShape : 'oval';
  let styles = LIBRARY[shape];
  if (p.maintenance === 'low') styles = [...styles].sort((a, b) => (MAINT[a] === 'low' ? -1 : 0) - (MAINT[b] === 'low' ? -1 : 0));
  const beard = p.beard && p.beard !== 'none';
  return {
    source: 'rules',
    summary: `For a ${shape} face with ${p.hairType} hair, aim for shapes that ${
      shape === 'round' ? 'add height and angles' : shape === 'oblong' ? 'add width and soften length' : 'keep proportions balanced'
    }.`,
    recommendations: styles.slice(0, 3).map((style) => ({
      style,
      why: `Complements a ${shape} face shape and works with ${p.hairType} hair.`,
      maintenance: MAINT[style] || 'medium',
      suggested_services: ['Classic Haircut', ...(beard ? ['Beard Trim & Shape'] : [])],
      barber_instructions: `Ask for a ${style.toLowerCase()}${beard ? ' and tidy the beard line to match' : ''}.`,
    })),
    products: p.hairType === 'curly' ? ['Curl cream', 'Leave-in conditioner'] : ['Matte clay', 'Sea salt spray'],
  };
}

/**
 * @param {{faceShape:string, hairType:string, hairLength:string, beard?:string, lifestyle?:string, maintenance?:string, notes?:string}} profile
 */
export async function recommendHairstyles(profile) {
  if (!client) return ruleBased(profile);
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Server-side fallback: if the primary model declines, the API re-routes automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(RecommendationSchema) },
      system:
        'You are an expert master barber at Klippers. Recommend 3 hairstyles suited to the client. ' +
        'Only suggest services from this menu: Classic Haircut, Skin Fade, Beard Trim & Shape, Hot Towel Shave, ' +
        'Hair Coloring, Hair Wash & Style, Charcoal Facial, The Gentleman Package.',
      messages: [{ role: 'user', content: `Client profile (JSON): ${JSON.stringify(profile)}` }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return ruleBased(profile);
    return { source: 'ai', ...response.parsed_output };
  } catch (err) {
    console.error('[ai] Claude request failed, using rule-based fallback:', err.message);
    return ruleBased(profile);
  }
}
