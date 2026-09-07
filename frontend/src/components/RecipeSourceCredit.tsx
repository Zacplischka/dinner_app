/**
 * The one end-of-method credit, which doubles as the degrade path: a Recipe
 * whose snapshotted steps are empty shows this line in place of the method.
 * Spoonacular is the sole recipe *vendor* in v1, so a missing source name still
 * has an honest thing to credit; a missing URL is simply not a link.
 *
 * An Owned Recipe is the one thing that renders nothing at all, in both paths:
 * it names no source and the absence is correct (ADR 0012). Only the explicit
 * `provenance` says so — a missing name alone is a data glitch, and the vendor
 * credit is a licence obligation that must survive one (#314).
 */
export default function RecipeSourceCredit({
  hasMethod = true,
  label = 'Recipe',
  sourceName,
  sourceUrl,
  provenance,
}: {
  hasMethod?: boolean;
  label?: string;
  sourceName?: string;
  sourceUrl?: string;
  provenance?: 'owned';
}) {
  if (provenance === 'owned') return null;
  const name = sourceName ?? 'Spoonacular';
  const source = sourceUrl ? (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-cyan hover:underline"
    >
      {name}
    </a>
  ) : (
    <span className="font-semibold text-text">{name}</span>
  );

  return hasMethod ? (
    <p className="mt-6 text-center text-sm text-muted">
      {label} from {source}.
    </p>
  ) : (
    <p className="text-center text-muted">
      This recipe&rsquo;s method didn&rsquo;t come through with the list. The full method is at{' '}
      {source}.
    </p>
  );
}
